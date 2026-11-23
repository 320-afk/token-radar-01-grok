// Offline dashboard. Reads window.RADAR from ../data.js; no fetch, no network, no modules.
(function () {
  'use strict';
  var data = window.RADAR;
  if (!data) return;
  var C = data.model || {};
  var byId = function (id) { return document.getElementById(id); };
  var watch = {};
  (data.watchlist || []).forEach(function (s) { watch[s] = true; });

  var ranked = (data.rows || []).map(function (r) {
    return {
      rank: r.rank, slug: r.slug, name: r.name, category: r.category,
      chains: r.chains || [], tvl_usd: r.tvl_usd, change_7d: r.change_7d,
      listed_at: r.listed_at, age_days: r.age_days, implied_value_usd: r.implied_value_usd,
      mcap_usd: null, token_status: 'records_no_token', model: r.model || null,
      growth_pct: r.growth_pct, growth_mult: r.growth_mult, maturity: r.maturity,
      growth_imputed: r.growth_imputed, age_imputed: r.age_imputed,
      farm: (data.farm_by_slug && data.farm_by_slug[r.slug]) || []
    };
  });
  var live = (data.live || []).map(function (r) {
    return {
      rank: null, slug: r.slug, name: r.name, category: r.category,
      chains: r.chains || [], tvl_usd: r.tvl_usd, change_7d: r.change_7d,
      listed_at: r.listed_at, age_days: null, implied_value_usd: null,
      mcap_usd: r.mcap_usd, token_status: 'token_recorded', model: null, farm: []
    };
  });
  var all = ranked.concat(live);
  var sortKey = 'rank', sortDir = 1;

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function num(n) { return typeof n === 'number' ? n.toFixed(4) : '—'; }
  function short(n) { return typeof n === 'number' ? String(Math.round(n * 1000) / 1000) : '—'; }
  function esc(s) {
    var m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return m[c]; });
  }

  byId('subtitle').textContent =
    'Snapshot ' + data.as_of + ' · model ' + data.model_version +
    ' · floor ' + money(data.floor_usd) +
    ' · watchlist ' + data.watchlist_size +
    ' · board ' + data.board_size + ' rows · early discoveries ' + data.early_size;

  var formula = byId('formula');
  formula.textContent =
    'Selected formula (radar-v3-momentum): implied = round(TVL^0.5 × 10000 × ' +
    '(1 + clamp(7d%, -60, 120)/100)^3 × (0.7 + min(age,1095)/1095 × 0.3)). ' +
    'Every constant here is an assumption, not an official value or a return promise. ' +
    'The baseline model was size-led and reproduced the starter ranking; the selected momentum model ' +
    'uses sublinear size and superlinear capped growth so early strong-growth protocols can surface. ' +
    'Raw 7d 4448.4747 is capped at 120 before the exponent.';

  var cats = {}, chains = {};
  all.forEach(function (r) {
    cats[r.category || 'Unclassified'] = true;
    r.chains.forEach(function (c) { chains[c] = true; });
  });
  function fill(id, values) {
    var select = byId(id);
    values.sort().forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v; select.appendChild(o);
    });
  }
  fill('cat', Object.keys(cats));
  fill('chain', Object.keys(chains));

  function baseCmp(x, y) {
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === 'string') return x < y ? -1 : x > y ? 1 : 0;
    return x - y;
  }

  function visible() {
    var q = byId('q').value.trim().toLowerCase();
    var cat = byId('cat').value, chain = byId('chain').value;
    var status = byId('status').value;
    var raw = byId('min').value;
    var min = raw === '' ? 0 : Number(raw);
    if (!isFinite(min) || min < 0) min = 0;
    return all.filter(function (r) {
      if (cat && (r.category || 'Unclassified') !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (status && r.token_status !== status) return false;
      if ((r.implied_value_usd || 0) < min) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + r.chains.join(' ') + ' ' + (r.category || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return baseCmp(a[sortKey], b[sortKey]) * sortDir; });
  }

  function render() {
    var list = visible();
    byId('count').textContent = list.length + ' / ' + all.length + ' rows';
    byId('filter-state').textContent =
      'Active filters — text: ' + (byId('q').value.trim() || 'none') +
      ' · category: ' + (byId('cat').value || 'all') +
      ' · chain: ' + (byId('chain').value || 'all') +
      ' · status: ' + (byId('status').value || 'all') +
      ' · min implied: ' + money(byId('min').value === '' ? 0 : Number(byId('min').value)) +
      ' · sort: ' + sortKey + (sortDir === 1 ? ' ascending' : ' descending');
    var body = byId('rows');
    body.textContent = '';
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      var m = r.model || {};
      tr.innerHTML =
        '<td class="num">' + (r.rank === null ? '—' : r.rank) + '</td>' +
        '<td>' + esc(r.name) + ' <span class="tag">' + esc(r.slug) + '</span>' +
        (watch[r.slug] ? ' <span class="tag wl">watchlist</span>' : '') + '</td>' +
        '<td>' + esc(r.category || 'Unclassified') + '</td>' +
        '<td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' …' : '') + '</td>' +
        '<td>' + (r.token_status === 'records_no_token'
          ? '<span class="tag wl">records no token</span>'
          : '<span class="tag live">token recorded</span>') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="model">' + (r.model
          ? 'TVL^' + short(m.tvl_exponent) + ' × ' + money(m.scale) +
            ' × ' + short(m.growth_mult) + ' × ' + short(m.maturity)
          : 'no implied value') + '</td>' +
        '<td class="num">' + (r.implied_value_usd === null ? '—' : money(r.implied_value_usd)) + '</td>';
      tr.addEventListener('click', function () { detail(r); });
      body.appendChild(tr);
    });
  }

  function detail(r) {
    var d = byId('detail');
    d.hidden = false;
    var s = '<button class="close" id="dc">×</button><h2>#' +
      (r.rank === null ? '—' : r.rank) + ' ' + esc(r.name) + '</h2>' +
      '<p class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'Unclassified') +
      ' · ' + esc(r.chains.join(', ')) + ' · ' + r.token_status + '</p>';
    if (r.token_status === 'token_recorded') {
      s += '<h3>Token recorded — market value only</h3><dl>' +
        '<dt>TVL (snapshot)</dt><dd>' + money(r.tvl_usd) + '</dd>' +
        '<dt>Market cap (snapshot)</dt><dd>' + money(r.mcap_usd) + '</dd>' +
        '<dt>7d change raw</dt><dd>' + pct(r.change_7d) + '</dd>' +
        '</dl><p>This row records a token, so the model assigns it no implied value.</p>';
    } else {
      var m = r.model || {};
      var clipped = r.change_7d !== null &&
        (r.change_7d > (m.growth_cap ?? C.growth_cap) || r.change_7d < (m.growth_floor ?? C.growth_floor));
      s += '<h3>Implied-value formula components</h3><dl>' +
        '<dt>TVL (snapshot)</dt><dd>' + money(r.tvl_usd) + '</dd>' +
        '<dt>tvl_exponent (assumption)</dt><dd>' + num(m.tvl_exponent) + '</dd>' +
        '<dt>scale (assumption)</dt><dd>' + num(m.scale) + '</dd>' +
        '<dt>growth_weight (assumption)</dt><dd>' + num(m.growth_weight) + '</dd>' +
        '<dt>growth_exponent (assumption)</dt><dd>' + num(m.growth_exponent) + '</dd>' +
        '<dt>raw 7d (change_7d)</dt><dd>' + (r.change_7d === null ? 'null' : pct(r.change_7d)) + '</dd>' +
        '<dt>capped growth pct (growth_pct)</dt><dd>' + num(r.growth_pct) + '%' +
        (r.growth_imputed ? ' (change_7d was null → 0)' : '') +
        (clipped ? ' (raw clipped to growth_floor/growth_cap before the exponent)' : '') + '</dd>' +
        '<dt>growth factor (growth_mult)</dt><dd>' + num(r.growth_mult) + '</dd>' +
        '<dt>growth_floor (assumption)</dt><dd>' + num(m.growth_floor) + '</dd>' +
        '<dt>growth_cap (assumption)</dt><dd>' + num(m.growth_cap) + '</dd>' +
        '<dt>listed_at (raw)</dt><dd>' + (r.listed_at === null ? 'null' : esc(r.listed_at)) + '</dd>' +
        '<dt>age_days</dt><dd>' + (r.age_days === null
          ? 'null → ' + num(m.unknown_age_days) + ' assumed' : String(r.age_days)) + '</dd>' +
        '<dt>maturity</dt><dd>' + num(r.maturity) + '</dd>' +
        '<dt>maturity_floor (assumption)</dt><dd>' + num(m.maturity_floor) + '</dd>' +
        '<dt>maturity_range (assumption)</dt><dd>' + num(m.maturity_range) + '</dd>' +
        '<dt>maturity_days (assumption)</dt><dd>' + num(m.maturity_days) + '</dd>' +
        '<dt>unknown_age_days (assumption)</dt><dd>' + num(m.unknown_age_days) + '</dd>' +
        '<dt>implied value</dt><dd>' + money(r.implied_value_usd) + '</dd>' +
        '</dl>';
      s += '<h3>Raw and imputed fields</h3><dl>' +
        '<dt>raw 7d (change_7d)</dt><dd>' + (r.change_7d === null ? 'null' : pct(r.change_7d)) + '</dd>' +
        '<dt>capped growth pct (growth_pct)</dt><dd>' + num(r.growth_pct) + '%' + '</dd>' +
        '<dt>listed_at (raw)</dt><dd>' + (r.listed_at === null ? 'null' : esc(r.listed_at)) + '</dd>' +
        '<dt>age_days</dt><dd>' + (r.age_days === null ? 'null' : String(r.age_days)) + '</dd>' +
        '<dt>growth_imputed</dt><dd>' + String(!!r.growth_imputed) + '</dd>' +
        '<dt>age_imputed</dt><dd>' + String(!!r.age_imputed) + '</dd>' +
        '</dl>';
      s += '<h3>Model subobject</h3><pre>' + esc(JSON.stringify(m, null, 2)) + '</pre>';
      s += '<h3>Farm plan — cost, time, risk</h3><ol>';
      r.farm.forEach(function (t) { s += '<li>' + esc(t) + '</li>'; });
      s += '</ol>';
      if (r.farm.length === 0) s += '<p>Farm steps are listed in board.json for this row.</p>';
    }
    d.innerHTML = s;
    byId('dc').addEventListener('click', function () { d.hidden = true; });
    d.scrollIntoView();
  }

  function renderAnchors() {
    var top = live.slice().sort(function (a, b) {
      return (b.mcap_usd || 0) - (a.mcap_usd || 0);
    }).slice(0, 8);
    var box = byId('anchors-body');
    box.textContent = '';
    top.forEach(function (r) {
      var li = document.createElement('li');
      li.textContent = r.name + ' (' + r.slug + ') · ' + (r.category || 'Unclassified') +
        ' · snapshot mcap ' + money(r.mcap_usd) + ' · no implied value';
      box.appendChild(li);
    });
  }
  renderAnchors();

  byId('filtered').addEventListener('click', function () {
    byId('q').value = ''; byId('cat').value = ''; byId('chain').value = '';
    byId('status').value = 'records_no_token'; byId('min').value = '10000000';
    sortKey = 'implied_value_usd'; sortDir = -1;
    render();
    byId('board').scrollIntoView();
  });

  Array.prototype.forEach.call(document.querySelectorAll('th[data-key]'), function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-key');
      if (key === sortKey) sortDir = -sortDir; else { sortKey = key; sortDir = 1; }
      render();
    });
  });
  ['q', 'cat', 'chain', 'status', 'min'].forEach(function (id) {
    byId(id).addEventListener('input', render);
    byId(id).addEventListener('change', render);
  });
  byId('reset').addEventListener('click', function () {
    byId('q').value = ''; byId('cat').value = ''; byId('chain').value = '';
    byId('status').value = ''; byId('min').value = '';
    sortKey = 'rank'; sortDir = 1; render();
  });
  render();

  // Hash routes make a board, detail or filtered state reproducible from this exact file,
  // including after a hash-only navigation in an already open page.
  function applyHash() {
    var hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (hash.indexOf('detail/') === 0) {
      var slug = hash.slice(7);
      var hit = all.filter(function (r) { return r.slug === slug; })[0];
      if (hit) detail(hit);
    } else if (hash.indexOf('view/') === 0) {
      var v = hash.slice(5);
      var opts = byId('status').options;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === v) { byId('status').value = v; break; }
      }
      render();
    }
  }
  window.addEventListener('hashchange', applyHash);
  applyHash();
})();
