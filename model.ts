// token-radar-01 value model. Node 22, standard library only.
// Every number comes from the sealed snapshot; every constant below is an explicit assumption.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

// All value-model constants in one exported object; every value is an assumption, not an official figure.
// Two snapshot-only candidates are compared in final-evidence/logs/model-comparison.md.
export interface ModelConstants {
  tvl_exponent: number;
  scale: number;
  growth_weight: number;
  growth_exponent: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

// Candidate A: the size-led formula that reproduces the starter's top three.
export const BASELINE_MODEL: ModelConstants = {
  tvl_exponent: 1,
  scale: 0.25,
  growth_weight: 0.5,
  growth_exponent: 1,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

// Candidate B: sublinear TVL and superlinear capped growth surface strong early protocols.
export const MOMENTUM_MODEL: ModelConstants = {
  tvl_exponent: 0.5,
  scale: 10000,
  growth_weight: 1,
  growth_exponent: 3,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
};

export const MODEL: ModelConstants = MOMENTUM_MODEL;
export const MODEL_VERSION = 'radar-v3-momentum';

export interface ModelDetail {
  tvl_exponent: number;
  scale: number;
  growth_weight: number;
  growth_exponent: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  growth_pct: number;
  growth_mult: number;
  maturity: number;
  age_days: number | null;
  growth_imputed: boolean;
  age_imputed: boolean;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'records_no_token';
  age_days: number | null;
  implied_value_usd: number;
  model: ModelDetail;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  token_status: 'records_no_token';
  model: ModelDetail;
  growth_pct: number;
  growth_mult: number;
  maturity: number;
  growth_imputed: boolean;
  age_imputed: boolean;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'token_recorded';
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  records_no_token_total: number;
  token_recorded_total: number;
  rows: RadarRow[];
  live: LiveRow[];
  farm_by_slug: Record<string, string[]>;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;
const EXCLUDED_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

// A protocol "records no token" only when all three token markers are null. A row whose mcap_usd is
// 0 or -1 still carries gecko_id and symbol, so it is token_recorded and never enters the ranked pool.
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function impliedValue(p: SnapshotProtocol, asOf: string, model: ModelConstants) {
  const age = ageDays(asOf, p.listed_at);
  const growthImputed = p.change_7d === null;
  const ageImputed = age === null;
  const rawGrowth = p.change_7d === null ? 0 : p.change_7d;
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = Math.pow(1 + (growthPct / 100) * model.growth_weight, model.growth_exponent);
  const effectiveAge = age === null ? model.unknown_age_days : age;
  const maturity = model.maturity_floor
    + (Math.min(effectiveAge, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.min(100_000_000_000_000,
    Math.round(Math.pow(p.tvl_usd, model.tvl_exponent) * model.scale * growthMult * maturity)));
  return { implied, growthPct, growthMult, maturity, age, growthImputed, ageImputed };
}

function isEarlyDiscovery(p: SnapshotProtocol, floor: number): boolean {
  if (!recordsNoToken(p) || p.tvl_usd >= floor) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name) || WRAPPED.test(p.name) || EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

// Assumption: minimum capital by TVL tier.
function capitalTier(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

// Assumption: observation window in weeks by age.
function holdWeeks(age: number | null): number {
  if (age === null) return 4;
  if (age < 180) return 8;
  if (age < 365) return 6;
  return 4;
}

// Each entry is a grammatical imperative clause used directly as the start of farm step 3.
const CATEGORY_ACTIONS: { test: (c: string) => boolean; action: string; risk: string }[] = [
  { test: (c) => /lending|cdp|collateral/i.test(c), action: 'Supply USDC or borrow against collateral', risk: 'collateral liquidation if the position moves against you' },
  { test: (c) => /dexs|dex|yield|liquidity|leveraged farming/i.test(c), action: 'Provide liquidity to the main pool', risk: 'impermanent loss and pool liquidity limits' },
  { test: (c) => /staking|restaking|stake pool/i.test(c), action: "Stake the chain's native staking asset", risk: 'slashing or a lock-up delay on exit' },
  { test: (c) => /bridge|cross chain bridge/i.test(c), action: 'Bridge USDC to the destination chain', risk: 'bridge and contract failure on either chain' },
  { test: (c) => /derivatives|perps|perpetual|options/i.test(c), action: 'Open one small hedged position', risk: 'loss on the position if the hedge moves' },
  { test: (c) => /prediction/i.test(c), action: 'Take one small market position', risk: 'loss of the staked amount on the market outcome' },
  { test: (c) => /rwa|stablecoin|reserve currency/i.test(c), action: "Mint or hold the protocol's asset", risk: 'contract failure or thin redemption liquidity' },
];

function categoryPlan(category: string | null): { action: string; risk: string } {
  const c = category ?? '';
  for (const row of CATEGORY_ACTIONS) {
    if (row.test(c)) return { action: row.action, risk: row.risk };
  }
  return { action: "Deposit the protocol's base asset and keep the receipt", risk: 'contract failure or thin exit liquidity' };
}

function observationWindow(age: number | null): string {
  if (age === null) return 'the window is long because listed_at is imputed; use weekly checks';
  if (age < 180) return 'the window is short; check weekly';
  if (age < 365) return 'the window is medium; check weekly';
  return 'the window is long; check weekly';
}

function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its primary chain';
  const capital = capitalTier(p.tvl_usd);
  const weeks = holdWeeks(age);
  const plan = categoryPlan(p.category);
  const name = p.name;
  const c = p.category ?? 'unclassified';
  const window = observationWindow(age);
  return [
    `Verify in ${name}'s own docs and its DefiLlama record, using ${chain} as its chain, that it records no token; write down what you can verify. Cost: $0 plus your time. Time: ~10 min (assumption). Risk: records change without notice.`,
    `Fund a dedicated wallet on ${chain} with only the $${capital} principal you are willing to risk; keep its seed phrase offline. Cost: $${capital} principal plus the network fee quoted by your wallet at signing. Time: ~10 min (assumption). Risk: an irreversible transfer to a wrong address or chain.`,
    `${plan.action} through ${name}'s own app on ${chain}; keep the transaction receipt. Cost: $${capital} principal plus the network fee quoted by your wallet at signing. Time: ~15 min (assumption). Risk: ${plan.risk}.`,
    `Repeat one small qualifying action in the ${c} category on ${chain} in each of the next ${weeks} weeks; ${window}. Cost: the network fee quoted by your wallet each time. Time: ${weeks} weeks (assumption). Risk: fees accumulate and the snapshot promises no reward.`,
    `Read any points or rewards information that ${name} publishes on ${chain} from a link you typed yourself; never pay a third party to claim. Cost: $0 to check plus the network fee quoted by your wallet at signing if you transact. Time: ~10 min (assumption). Risk: phishing pages and fabricated claim offers.`,
    `Log the wallet, dates, transaction hashes and your exit rule for ${chain}, then withdraw when your own rule is met. Cost: the withdrawal network fee quoted at signing. Time: ~10 min (assumption). Risk: withdrawal delay or thin exit liquidity.`,
  ];
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

function slugCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const watchSlugs = new Set(snapshot.watchlist);
  const early = snapshot.protocols
    .filter((p) => !watchSlugs.has(p.slug) && isEarlyDiscovery(p, snapshot.floor_usd))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || slugCompare(a.slug, b.slug));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || slugCompare(a.p.slug, b.p.slug));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'records_no_token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      // Per-row constants let the dashboard recalculate the selected formula without a lookup.
      tvl_exponent: model.tvl_exponent,
      scale: model.scale,
      growth_weight: model.growth_weight,
      growth_exponent: model.growth_exponent,
      growth_floor: model.growth_floor,
      growth_cap: model.growth_cap,
      maturity_floor: model.maturity_floor,
      maturity_range: model.maturity_range,
      maturity_days: model.maturity_days,
      unknown_age_days: model.unknown_age_days,
      growth_pct: round4(s.growthPct),
      growth_mult: round4(s.growthMult),
      maturity: round4(s.maturity),
      age_days: s.age,
      growth_imputed: s.growthImputed,
      age_imputed: s.ageImputed,
    },
    farm_steps: farmSteps(s.p, s.age),
  }));
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const rows: RadarRow[] = board.map((r) => ({
    rank: r.rank,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    listed_at: r.listed_at,
    age_days: r.age_days,
    implied_value_usd: r.implied_value_usd,
    token_status: 'records_no_token',
    model: r.model,
    growth_pct: r.model.growth_pct,
    growth_mult: r.model.growth_mult,
    maturity: r.model.maturity,
    growth_imputed: r.model.growth_imputed,
    age_imputed: r.model.age_imputed,
  }));
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !recordsNoToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || slugCompare(a.slug, b.slug))
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'token_recorded',
    }));
  return {
    board,
    radar: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model,
      model_version: MODEL_VERSION,
      watchlist: snapshot.watchlist.slice(),
      watchlist_size: snapshot.watchlist.length,
      board_size: board.length,
      early_size: rows.filter((r) => !snapshot.watchlist.includes(r.slug)).length,
      records_no_token_total: snapshot.protocols.filter(recordsNoToken).length,
      token_recorded_total: live.length,
      rows,
      live,
      farm_by_slug: Object.fromEntries(board.map((r) => [r.slug, r.farm_steps])),
    },
  };
}

function nullableString(index: number, field: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  throw new SnapshotError(`protocol ${index} has a non-string ${field}`);
}

function nullableNumber(index: number, field: string, value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new SnapshotError(`protocol ${index} has a non-numeric ${field}`);
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json must be an object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no valid as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no valid floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');

  const seen = new Set<string>();
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`protocol ${i} lacks slug, name or TVL`);
    }
    if (seen.has(p.slug)) throw new SnapshotError(`protocol ${i} repeats slug ${p.slug}`);
    if (!Array.isArray(p.chains) || p.chains.some((c) => typeof c !== 'string')) {
      throw new SnapshotError(`protocol ${i} has no chains array of strings`);
    }
    seen.add(p.slug);
    return {
      slug: p.slug,
      name: p.name,
      category: nullableString(i, 'category', p.category),
      chains: p.chains as string[],
      tvl_usd: p.tvl_usd,
      change_7d: nullableNumber(i, 'change_7d', p.change_7d),
      mcap_usd: nullableNumber(i, 'mcap_usd', p.mcap_usd),
      listed_at: nullableString(i, 'listed_at', p.listed_at),
      gecko_id: nullableString(i, 'gecko_id', p.gecko_id),
      symbol: nullableString(i, 'symbol', p.symbol),
    };
  });
  const bySlug = new Map(protocols.map((p) => [p.slug, p]));
  for (const slug of o.watchlist as string[]) {
    const p = bySlug.get(slug);
    if (p === undefined) throw new SnapshotError(`watchlist slug ${slug} is absent from protocols`);
    if (!recordsNoToken(p)) throw new SnapshotError(`watchlist slug ${slug} records a token`);
  }
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

// All gate-shape checks run before any output file is written.
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slugs`;
  if (slugs.size !== board.length) return 'board has duplicate slugs';
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) return `rank ${i + 1} is wrong`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i}`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return 'all rows share the same implied value';
  }
  for (const r of board) {
    if (r.token_status !== 'records_no_token') return `${r.slug} records a token`;
    if (r.mcap_usd !== null || r.gecko_id !== null || r.symbol !== null) return `${r.slug} records a token`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has bad implied value`;
    if (r.farm_steps.length !== 6) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
      if (!/Cost:/.test(t) || !/Time:.*\(assumption\)\./.test(t) || !/Risk:/.test(t)) return `${r.slug} has a malformed farm step`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
