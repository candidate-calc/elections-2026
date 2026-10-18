(function () {
  'use strict';
  var S = window.Elec26Score;
  var CFG = window.__SITE_CONFIG__ || null;
  var D = null;
  var idx = {};
  var state = { openRows: {} };
  var KEYS = S.CRITERIA;

  var KIND = { vote: 'הצבעה', action: 'מעשה', quote: 'ציטוט', interview: 'ראיון', report: 'דיווח' };
  var SRC = { primary: 'מקור ראשוני', news: 'חדשות', opinion: 'מאמר דעה' };
  var DIR = { supports: 'תומך ברמה גבוהה', against: 'מצביע על רמה נמוכה', mixed: 'מעורב', neutral: 'רקע' };
  var VER = {
    verbatim_confirmed: ['v-ok', 'ציטוט מאומת'],
    paraphrase: ['v-para', 'בתמצית'],
    unverified: ['v-un', 'לא אומת']
  };
  var TRANSCRIPT_NOTE = 'נוסח מתמלול אוטומטי של הסרטון; ייתכנו שגיאות. הקישור מוביל לרגע הרלוונטי';
  var AVG_LABEL ='ממוצע הסקר האחרון של כל ערוץ';
  var TINY = { cf: 'התפשרות', luc: 'נאמנות בפשרות', lwp: 'נאמנות ללא תפקיד', lib: 'ליברליזם', jud: 'מערכת המשפט', rol: 'שלטון החוק' };
  var CONF = { high: 'ביטחון גבוה', medium: 'ביטחון בינוני', low: 'ביטחון נמוך' };
  var AGREE = { agree: 'שני המנקדים הסכימו', mean: 'ממוצע של שני מנקדים (הפרש של רמה אחת)', arbiter: 'הוכרע על ידי מכריע' };
  var PROXY = {
    P1: 'התחייבויות ומעשים של ראש הרשימה',
    P2: 'מכשירים מחייבים (התחייבות חתומה, הסכם, תקנון)',
    P3: 'שיטת בחירת המועמדים (לתצוגה בלבד)',
    P4: 'מבנה הרשימה והיסטוריית פילוגים'
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function $(id) { return document.getElementById(id); }
  var NDASH = String.fromCharCode(0x2013), LRI = String.fromCharCode(0x2066), PDI = String.fromCharCode(0x2069);
  var RANGE = new RegExp('([0-9]+(?:[.,/-][0-9]+)*)' + NDASH + '([0-9]+(?:[.,/-][0-9]+)*)', 'g');
  var ISO_DATE = /(^|[^0-9])([0-9]{4})-([0-9]{2})-([0-9]{2})(?![0-9-])/g;
  function heDates(t) { return t.replace(ISO_DATE, function (m, pre, y, mo, d) { return pre + (+d) + '.' + (+mo) + '.' + y; }); }
  /* Text between tags only: ISO dates become D.M.YYYY, numeric ranges are isolated as one LTR unit. */
  function ltrRanges(h) {
    return h.replace(/(^|>)([^<]+)/g, function (m, open, text) {
      return open + heDates(text).replace(RANGE, LRI + '$1' + NDASH + '$2' + PDI);
    });
  }
  function fmtDate(d) {
    if (!d) return 'תאריך לא ידוע';
    var p = String(d).split('-');
    if (p.length === 3) return (+p[2]) + '.' + (+p[1]) + '.' + p[0];
    if (p.length === 2) return (+p[1]) + '.' + p[0];
    return p[0];
  }
  function shortRange(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    if (a === b) return fmtDate(a);
    if (pa[0] === pb[0] && pa[1] === pb[1]) return (+pa[2]) + '–' + (+pb[2]) + '.' + (+pb[1]) + '.' + pb[0];
    return fmtDate(a) + '–' + fmtDate(b);
  }
  function period(from, to) {
    if (from && to) return '<bdi dir="ltr">' + fmtDate(from) + '–' + fmtDate(to) + '</bdi>';
    if (from) return 'מ-<bdi dir="ltr">' + fmtDate(from) + '</bdi> ועד היום';
    if (to) return 'עד <bdi dir="ltr">' + fmtDate(to) + '</bdi>';
    return '';
  }
  function pct(x) { return Math.round(x * 100) + '%'; }
  var COUNT_HE = { 2: 'שתי', 3: 'שלוש', 4: 'ארבע', 5: 'חמש', 6: 'שש' };
  function byName(a, b) { return a.party.name_he.localeCompare(b.party.name_he, 'he'); }
  function dec1(x) { return x === null || x === undefined ? '—' : (Math.round(x * 10) / 10).toFixed(1); }
  function int(x) { return x === null || x === undefined ? '—' : String(Math.round(x)); }
  function num(x) { return x === null || x === undefined ? '—' : String(Math.round(x * 100) / 100); }
  function safeUrl(u) { return /^https?:\/\//i.test(u || '') ? u : null; }
  function extLink(u, text) {
    var s = safeUrl(u);
    return s ? '<a href="' + esc(s) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(text) + '</a>' : '';
  }

  function fetchJson(u) {
    return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); });
  }

  function load() {
    var dataP = window.__SITE_DATA__ ? Promise.resolve(window.__SITE_DATA__) :
      fetchJson('data/site-data.json').catch(function () {
        return fetchJson('fixtures/site-data.demo.json').then(function (d) { d.__fixture = true; return d; });
      });
    var cfgP = CFG ? Promise.resolve(CFG) : fetchJson('config.json').catch(function () { return {}; });
    Promise.all([dataP, cfgP]).then(function (res) { D = res[0]; CFG = res[1] || {}; init(); }, function () {
      var app = $('app') || $('corrections');
      if (app) app.innerHTML = '<p class="card">לא ניתן לטעון את הנתונים.</p>';
    });
  }

  function buildIndex() {
    idx.party = {}; D.parties.forEach(function (p) { idx.party[p.slug] = p; });
    idx.cand = {}; D.candidates.forEach(function (c) { idx.cand[c.id] = c; });
    idx.candByParty = S.candidatesByParty(D.candidates);
    idx.ev = {}; idx.evByCand = {};
    D.evidence.forEach(function (e) {
      idx.ev[e.id] = e;
      if (e.candidate_id) {
        var m = idx.evByCand[e.candidate_id] = idx.evByCand[e.candidate_id] || {};
        (m[e.criterion || 'other'] = m[e.criterion || 'other'] || []).push(e);
      }
    });
    idx.crit = {}; D.criteria.forEach(function (c) { idx.crit[c.key] = c; });
  }

  /* Poll blackout: from the end of the publication-cutoff day (Israel time, +03:00) even without a rebuild. */
  function isFrozen() {
    var f = D.meta.freeze;
    if (!f) return false;
    if (f.frozen) return true;
    var until = Date.parse((f.polls_published_until || '2026-10-23') + 'T00:00:00+03:00');
    return !isNaN(until) && Date.now() >= until + 86400000;
  }

  /* Poll scenarios (SITE_DATA_SCHEMA section 13). Without scenarios in the data, the average is the only one. */
  function scenarios() { return D.scenarios && D.scenarios.items ? D.scenarios : null; }
  function scenDefault() { var sc = scenarios(); return sc ? sc.default : 'average'; }
  function scen() { var sc = scenarios(); return sc ? sc.items[state.scen] : null; }
  function isAverage() { var it = scen(); return !it || it.kind === 'average'; }
  /* The party as seen in the selected scenario: window, weights, precomputed default view, threshold, seats. */
  function sp(p) {
    var it = scen(), x = it && it.parties[p.slug];
    var src = x || p;
    var risk = { threshold_factor_default: src.threshold_factor_default, at_risk: !!src.at_risk, at_risk_basis_he: src.at_risk_basis_he || null, pass_rate_last3: src.pass_rate_last3, pass_rate_last10: src.pass_rate_last10 };
    if (!x) return Object.assign({ party: p, window: p.window, position_weights: p.position_weights, by_preset: p.by_preset, threshold: p.threshold, seats: p.polls.mean, below_threshold: false, flag_he: null }, risk);
    return Object.assign({ party: p, window: x.window, position_weights: x.position_weights, by_preset: x.by_preset, threshold: x.threshold, seats: x.seats, below_threshold: !!x.below_threshold, flag_he: x.flag_he }, risk);
  }
  function scenRanking(key) { var it = scen(); return it && it.ranking ? it.ranking[key] : D.ranking[key]; }
  function scenName() {
    var it = scen();
    if (!it || it.kind === 'average') return AVG_LABEL;
    return 'הסקר ' + it.label_he;
  }
  function pollRef(it) {
    if (!it || !it.poll) return null;
    var full = null;
    (D.polls.list || []).forEach(function (x) { if (x.id === it.poll.poll_id) full = x; });
    return { ref: it.poll, full: full };
  }

  /* risk can differ by scenario: the factor control is offered if any list is at risk in any scenario */
  function riskFactors() {
    var out = [];
    D.parties.forEach(function (p) {
      var atRiskSomewhere = p.at_risk;
      var sc = scenarios();
      if (sc) Object.keys(sc.items).forEach(function (id) { var x = sc.items[id].parties[p.slug]; if (x && x.at_risk) atRiskSomewhere = true; });
      var f = p.threshold_factor_at_risk !== undefined && p.threshold_factor_at_risk !== null ? p.threshold_factor_at_risk : p.threshold_factor_default;
      if (atRiskSomewhere && f !== undefined && f !== null) out.push(f);
    });
    return out;
  }
  function anyAtRisk() { return riskFactors().length > 0; }
  function defaultFactor() {
    var fs = riskFactors();
    return fs.length ? Math.min.apply(null, fs) : (D.defaults.threshold_factor_cap || 0.5);
  }
  function riskLine(r) {
    var v = r.view, f = r.threshold_factor;
    if (!v || !v.at_risk) return '';
    var basis = v.at_risk_basis_he ? esc(v.at_risk_basis_he) : 'הרשימה צפויה בתרחיש זה ל-5 מנדטים או פחות.';
    var head;
    if (state.tf === null) head = basis;
    else if (f === 1) head = 'ללא קנס סיכון (לפי ההגדרה שבחרתם). ' + basis;
    else head = 'הציון מוכפל ב-' + num(f) + ' (לפי ההגדרה שבחרתם). ' + basis;
    return '<p class="risk">' + head + (f !== 1 ? ' ציון לפני הקנס: ' + dec1(r.score_unpenalised_100) + '.' : '') + '</p>';
  }

  function isDemo() { return !!(D.meta.is_demo || D.__fixture || CFG.data_source === 'fixture'); }

  function init() {
    buildIndex();
    if (isDemo()) $('demo-banner').hidden = false;
    var bad = S.selfCheck(D);
    if (bad.length && window.console) console.warn('score.js differs from precomputed values:\n' + bad.join('\n'));
    if (document.body.getAttribute('data-page') === 'about') { renderCorrections(); return; }
    window.addEventListener('hashchange', function () { readHash(); render(true); });
    readHash();
    render(false);
  }

  /* ---------- state and hash ---------- */

  function equalWeights() {
    var w = D.defaults.weights, o = {};
    KEYS.forEach(function (k) { o[k] = w[k] * 100; });
    return o;
  }
  function isEqualWeights() {
    var n = S.normalizeWeights(state.w), d = D.defaults.weights;
    return KEYS.every(function (k) { return Math.abs(n[k] - d[k]) < 0.003; });
  }

  function readHash() {
    var h = location.hash.replace(/^#\/?/, ''), q = '', i = h.indexOf('?');
    if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i); }
    var parts = h.split('/').filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var prm = {};
    q.split('&').forEach(function (kv) {
      if (!kv) return;
      var j = kv.indexOf('=');
      if (j > 0) prm[kv.slice(0, j)] = decodeURIComponent(kv.slice(j + 1));
    });
    state.route = 'home';
    if (parts[0] === 'party' && idx.party[parts[1]]) { state.route = 'party'; state.slug = parts[1]; }
    else if (parts[0] === 'candidate' && idx.cand[parts[1] + '/' + parts[2]]) { state.route = 'candidate'; state.cid = parts[1] + '/' + parts[2]; state.slug = parts[1]; }
    else if (parts[0] === 'polls') state.route = 'polls';

    state.w = equalWeights();
    if (prm.w) {
      var vals = prm.w.split(',').map(parseFloat), w = {};
      KEYS.forEach(function (k, n) { w[k] = isNaN(vals[n]) ? 0 : Math.max(0, Math.min(100, vals[n])); });
      if (KEYS.some(function (k) { return w[k] > 0; })) state.w = w;
      if (isEqualWeights()) state.w = equalWeights();
    }
    state.mode = prm.pos === 'equal' ? 'equal' : 'marginal';
    var tf = parseFloat(prm.tf);
    state.tf = isNaN(tf) ? null : Math.min(1, Math.max(0, tf));
    var sc = scenarios();
    state.scen = sc && prm.poll && sc.items[prm.poll] ? prm.poll : scenDefault();
  }

  function query() {
    var p = [];
    if (!isEqualWeights()) p.push('w=' + KEYS.map(function (k) { return Math.round(state.w[k] * 10) / 10; }).join(','));
    if (state.mode === 'equal') p.push('pos=equal');
    if (state.tf !== null) p.push('tf=' + state.tf);
    if (state.scen && state.scen !== scenDefault()) p.push('poll=' + encodeURIComponent(state.scen));
    return p.length ? '?' + p.join('&') : '';
  }
  function routePath() {
    if (state.route === 'party') return 'party/' + state.slug;
    if (state.route === 'candidate') return 'candidate/' + state.cid;
    if (state.route === 'polls') return 'polls';
    return '';
  }
  function href(path) { return '#/' + path + query(); }
  function syncHash() {
    var h = '#/' + routePath() + query();
    if (location.hash !== h) history.replaceState(null, '', h);
  }
  function isPresetView() { return isEqualWeights() && state.mode === 'marginal' && state.tf === null; }

  /* ---------- computation ---------- */

  function compute() {
    var key = isPresetView() ? 'default' : null;
    var list = D.parties.map(function (p) {
      var v = sp(p);
      var r = S.partyScore(v, idx.candByParty[p.slug] || {}, {
        weights: state.w, mode: state.mode,
        minCov: D.defaults.known_score_min_coverage,
        thresholdFactor: v.at_risk && state.tf !== null ? state.tf : undefined
      });
      r.slug = p.slug; r.party = p; r.view = v;
      r.partial = r.coverage < D.defaults.partial_info_threshold;
      r.pre = key && v.by_preset ? v.by_preset[key] : null;
      return r;
    });
    var rk = key ? scenRanking(key) : null;
    if (key && rk && list.every(function (r) { return r.pre; })) {
      list.sort(function (a, b) { return a.pre.tie_group - b.pre.tie_group || b.score_100 - a.score_100 || byName(a, b); });
      list.forEach(function (r) {
        r.rank = r.pre.rank; r.rank_label = r.pre.rank_label;
        r.tie = rk.tie_groups[r.pre.tie_group].filter(function (s) { return s !== r.slug; });
      });
    } else {
      list = S.rankDeterministic(list.sort(byName));
      list.forEach(function (r) {
        r.tie = list.filter(function (o) { return o !== r && o.rank === r.rank; }).map(function (o) { return o.slug; });
      });
    }
    if (!(key && rk && list.every(function (r) { return r.pre; }))) { list.forEach(function (r) { r.pre = null; }); key = null; }
    return { list: list, key: key, allTied: list.length > 1 && list.every(function (r) { return r.tie.length === list.length - 1; }) };
  }
  function resultFor(slug) {
    var c = compute();
    for (var i = 0; i < c.list.length; i++) if (c.list[i].slug === slug) return c.list[i];
    return null;
  }
  function weightOf(party, pos) {
    var pw = S.positionWeights(sp(party), state.mode);
    for (var i = 0; i < pw.length; i++) if (pw[i].position === pos) return pw[i].weight;
    return 0;
  }

  /* ---------- small components ---------- */

  function levelView(cell, k) {
    var lvl = cell ? cell.level : null;
    if (lvl === null || lvl === undefined) {
      return '<span class="lv unk"><span class="meter unk" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="t">אין מידע (נספר כ-0)</span></span>';
    }
    var cells = '';
    for (var i = 1; i <= 4; i++) cells += '<i class="' + (lvl >= i ? 'f' : (lvl >= i - 0.5 ? 'h' : '')) + '"></i>';
    return '<span class="lv"><span class="meter" aria-hidden="true">' + cells + '</span><span class="t">' + num(lvl) + ' מתוך 4</span></span>';
  }
  function confView(c) {
    if (!c || !CONF[c]) return '';
    return '<span class="conf ' + c + '" role="img" aria-label="' + CONF[c] + '" title="' + CONF[c] + '"></span>';
  }
  function covBar(r) {
    var k = Math.round(r.coverage * 1000) / 10, u = Math.max(0, 100 - k);
    return '<div class="covbar" role="img" aria-label="ידוע ' + pct(r.coverage) + ' מהחלון, בלי מידע ' + Math.round(u) + '%">' +
      '<span class="k" style="width:' + k + '%"></span>' +
      '<span class="u" style="width:' + u + '%">' + (u >= 8 ? '?' : '') + '</span></div>' +
      '<div class="legend"><span><i class="k"></i>ידוע</span><span><i class="u"></i>אין מידע (נספר כ-0)</span></div>';
  }
  function bandView(r) {
    if (!r.pre) return '<p class="mode-note">בלי טווח אי-ודאות: החישוב לפי ההגדרות שבחרתם נעשה בדפדפן, בלי סימולציה.</p>';
    var lo = r.pre.interval_80[0], hi = r.pre.interval_80[1], s = r.score_100;
    var ticks = [0, 25, 50, 75, 100].map(function (t) { return '<span class="tick" style="right:' + t + '%">' + t + '</span>'; }).join('');
    return '<div class="band-wrap"><div class="small">טווח אי-ודאות (80%): ' + int(lo) + '–' + int(hi) + '</div>' +
      '<div class="band" aria-hidden="true"><span class="rng" style="right:' + lo + '%;width:' + (hi - lo) + '%"></span>' +
      '<span class="pt" style="right:' + s + '%"></span>' + ticks + '</div></div>';
  }
  function badges(r) {
    var b = [], p = r.party, v = r.view || sp(p);
    if (v.below_threshold) b.push('<span class="badge threshold">' + esc(v.flag_he || 'מתחת לאחוז החסימה בסקר זה') + '</span>');
    if (r.tie.length) b.push('<span class="badge tie">תיקו עם: ' + esc(r.tie.map(function (s) { return idx.party[s].name_he; }).join(', ')) + '</span>');
    if (r.partial) b.push('<span class="badge partial">מידע חלקי: על רוב החלון אין מידע</span>');
    if (v.threshold) b.push('<span class="badge threshold">עלולה לא לעבור את אחוז החסימה · עוברת ב-' + v.threshold.polls_passing + ' מתוך ' + v.threshold.polls_total + ' סקרים</span>');
    return b.length ? '<div class="badges">' + b.join('') + '</div>' : '';
  }
  function scoreBlock(r) {
    var known = r.known_score_100 === null ? 'אין די מידע לציון ידוע' : 'ציון ידוע ' + dec1(r.known_score_100);
    return '<div class="scoreline"><span class="big">' + dec1(r.score_100) + ' <small>מתוך 100</small></span>' +
      '<span class="split"><b class="def">' + r.unknown_cells + ' מתוך ' + r.total_cells + ' תאים ללא מידע</b>, נוקדו 0</span></div>' +
      '<div class="split">ידוע: <b>' + pct(r.coverage) + ' מהחלון</b> (' + known + ')</div>' +
      riskLine(r) + covBar(r) + bandView(r) + badges(r);
  }
  function windowLine(p) {
    var v = sp(p);
    return 'מקומות ' + v.window.from + '–' + v.window.to + ' ברשימה · ' + (isAverage() ? AVG_LABEL + ': ' + num(v.seats) : 'בסקר: ' + num(v.seats)) + ' מנדטים';
  }
  function shareBar(title) {
    var base = /^https?:$/.test(location.protocol) ? location.href.split('#')[0] : (CFG.base_url || '');
    var url = base + location.hash;
    var u = encodeURIComponent(url), t = encodeURIComponent(title);
    return '<div class="share" role="group" aria-label="שיתוף"><span>שיתוף:</span>' +
      '<a href="https://wa.me/?text=' + encodeURIComponent(title + ' ' + url) + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' +
      '<a href="https://t.me/share/url?url=' + u + '&amp;text=' + t + '" target="_blank" rel="noopener noreferrer">Telegram</a>' +
      '<a href="https://twitter.com/intent/tweet?url=' + u + '&amp;text=' + t + '" target="_blank" rel="noopener noreferrer">X</a>' +
      '<a href="https://www.facebook.com/sharer/sharer.php?u=' + u + '" target="_blank" rel="noopener noreferrer">Facebook</a>' +
      '<button type="button" data-copy="' + esc(url) + '">העתקת קישור</button></div>';
  }
  function copyText(text) {
    var done = function () { $('live').textContent = 'הקישור הועתק'; };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); return; }
    fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { $('live').textContent = text; }
      document.body.removeChild(ta);
    }
  }

  /* ---------- controls ---------- */

  /* label: visible text; tiny: optional shorter text shown on narrow screens; full: accessible name and tooltip */
  function slider(id, label, value, min, max, step, cls, tiny, full) {
    var vis = tiny ? '<span class="wide-l">' + esc(label) + '</span><span class="tiny-l">' + esc(tiny) + '</span>' : esc(label);
    return '<div class="slider ' + (cls || '') + '" title="' + esc(full || label) + '"><span class="fill" data-fill="' + id + '"></span>' +
      '<span class="lbl" aria-hidden="true">' + vis + '</span><span class="val" data-val="' + id + '"></span>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" aria-label="' + esc(full || label) + '"></div>';
  }
  function hint(text, label) {
    return '<details class="hint"><summary>&#9432; ' + (label || 'הסבר') + '</summary><p class="explain">' + text + '</p></details>';
  }
  /* home: always-visible settings rail beside the ranking; party: collapsible panel (closed on mobile) */
  function controlsHtml(home) {
    var sl = D.criteria.map(function (c) {
      return slider('w-' + c.key, c.short_he, state.w[c.key], 0, 60, 1, '', TINY[c.key], c.name_he);
    }).join('');
    var mobile = window.matchMedia && window.matchMedia('(max-width:900px)').matches;
    var sc = scenarios();
    var scenSel = sc ? '<fieldset><legend><label for="scen">לפי איזה סקר</label></legend><select id="scen" class="scen-select">' +
      sc.order.map(function (id) { return '<option value="' + esc(id) + '">' + esc(sc.items[id].kind === 'average' ? AVG_LABEL : sc.items[id].label_he) + '</option>'; }).join('') +
      '</select><details class="hint"><summary>&#9432; פרטי הסקר</summary><div id="scen-info" class="explain"></div></details></fieldset>' : '';
    var body = scenSel +
      '<fieldset><legend>משקלות הקריטריונים</legend><div class="wgrid">' + sl + '</div>' +
      hint('ברירת המחדל: משקל שווה לכל ששת הקריטריונים. המשקלות מנורמלים כך שסכומם 100%. הקריטריונים: ' + D.criteria.map(function (c) { return esc(c.name_he); }).join('; ') + '.') +
      '</fieldset>' +
      '<fieldset><legend>משקל המקומות בחלון</legend><div class="radio-row">' +
      '<label><input type="radio" name="pos" value="marginal"> לפי סיכוי הכרעה</label>' +
      '<label><input type="radio" name="pos" value="equal"> משקל שווה</label></div></fieldset>' +
      (anyAtRisk() ? '<fieldset><legend>קנס סיכון אחוז החסימה</legend><div class="seg">' +
        '<button type="button" data-tf="default">ברירת מחדל (' + num(defaultFactor()) + ')</button><button type="button" data-tf="1">ללא קנס (1)</button></div>' +
        slider('tf', 'מקדם לרשימה בסיכון', state.tf === null ? defaultFactor() : state.tf, 0, 1, 0.05, 'risk-slider') +
        hint('רשימה שנפלה מתחת לאחוז החסימה לפחות באחד הסקרים מקבלת ציון מוכפל במקדם הזה. ברירת המחדל: הנמוך מבין 0.5, שיעור המעבר ב-3 הסקרים האחרונים ושיעור המעבר ב-10 האחרונים. 1 פירושו ללא קנס. הקו האנכי מסמן את ברירת המחדל.') + '</fieldset>' : '') +
      '<div id="mode-note" class="mode-note"></div>' +
      '<div class="btn-row"><button type="button" class="btn" id="reset-w">איפוס למשקלות שווים</button><button type="button" class="btn" id="reset">איפוס הכול</button></div>';
    if (home) return '<div id="controls-wrap" class="controls rail card">' + body + '</div>';
    return '<details id="controls-wrap"' + (mobile ? '' : ' open') + '><summary>התאמת המשקלות וההנחות · <span id="scen-sum"></span></summary>' +
      '<div class="controls card"><h2>ההגדרות שלכם</h2>' + body + '</div></details>';
  }
  function updateControls() {
    var n = S.normalizeWeights(state.w);
    KEYS.forEach(function (k) {
      var el = $('w-' + k);
      if (!el) return;
      if (document.activeElement !== el) el.value = Math.round(state.w[k]);
      el.setAttribute('aria-valuetext', pct(n[k]));
      document.querySelector('[data-val="w-' + k + '"]').textContent = pct(n[k]);
      document.querySelector('[data-fill="w-' + k + '"]').style.width = Math.min(100, n[k] * 100 / 0.6) + '%';
    });
    document.querySelectorAll('input[name=pos]').forEach(function (b) { b.checked = b.value === state.mode; });
    var tfEl = $('tf');
    if (tfEl) {
      var tv = state.tf === null ? defaultFactor() : state.tf;
      if (document.activeElement !== tfEl) tfEl.value = tv;
      tfEl.setAttribute('aria-valuetext', num(tv) + (state.tf === null ? ' (ברירת מחדל)' : ''));
      document.querySelector('[data-val="tf"]').textContent = num(tv);
      document.querySelector('[data-fill="tf"]').style.width = (tv * 100) + '%';
      var mk = document.querySelector('.risk-slider .defmark');
      if (!mk) { mk = document.createElement('span'); mk.className = 'defmark'; mk.setAttribute('aria-hidden', 'true'); document.querySelector('.risk-slider').appendChild(mk); }
      mk.style.right = (defaultFactor() * 100) + '%';
    }
    document.querySelectorAll('[data-tf]').forEach(function (b) {
      var k = b.getAttribute('data-tf');
      b.setAttribute('aria-pressed', String(k === 'default' ? state.tf === null : state.tf === 1));
    });
    var sel = $('scen');
    if (sel) sel.value = state.scen;
    if ($('scen-sum')) $('scen-sum').textContent = scenName();
    var info = $('scen-info');
    if (info) {
      var pr = pollRef(scen());
      if (!pr) {
        var w = D.meta.poll_window;
        info.innerHTML = AVG_LABEL + ' (אינו סקר): ' + w.n_polls + ' סקרים, עבודת שטח <bdi dir="ltr">' + fmtDate(w.from) + '–' + fmtDate(w.to) + '</bdi>. <a href="' + href('polls') + '">הסקרים</a>';
      } else {
        var f = pr.full || {}, rf = pr.ref;
        var parts = ['מכון: ' + esc(rf.pollster || f.pollster || '')];
        parts.push('ערוץ: ' + esc(rf.outlet_he || rf.outlet || f.outlet || ''));
        parts.push('עבודת שטח עד <bdi dir="ltr">' + fmtDate(rf.fieldwork_to || f.fieldwork_to) + '</bdi>' + ((rf.published || f.published) ? ', פורסם <bdi dir="ltr">' + fmtDate(rf.published || f.published) + '</bdi>' : ''));
        if (f.sample_responded || f.sample_asked) parts.push('מדגם: ' + (f.sample_responded || f.sample_asked) + ' משיבים');
        var moe = rf.margin_of_error_pct !== undefined && rf.margin_of_error_pct !== null ? rf.margin_of_error_pct : f.margin_of_error_pct;
        if (moe !== undefined && moe !== null) parts.push('מרווח טעות: <bdi dir="ltr">±' + num(moe) + '%</bdi>');
        info.innerHTML = parts.join(' · ') + '. <a href="' + href('polls') + '">פרטי הסקר המלאים</a>';
      }
    }
    var note = $('mode-note');
    if (note) note.textContent = isPresetView()
      ? 'מחושב מראש, עם טווח אי-ודאות ותיקו.'
      : 'חישוב בדפדפן, בלי טווח אי-ודאות.';
  }
  function bindControls() {
    var root = $('controls-wrap');
    if (!root) return;
    root.addEventListener('input', function (e) {
      var t = e.target;
      if (t.id && t.id.indexOf('w-') === 0) {
        state.w[t.id.slice(2)] = +t.value;
        if (isEqualWeights()) state.w = equalWeights();
      } else if (t.name === 'pos') {
        state.mode = t.value;
      } else if (t.id === 'scen') {
        state.scen = t.value;
      } else if (t.id === 'tf') {
        state.tf = Math.abs(+t.value - defaultFactor()) < 1e-9 ? null : +t.value;
      } else return;
      changed();
    });
    root.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.hasAttribute('data-tf')) { state.tf = t.getAttribute('data-tf') === 'default' ? null : 1; }
      else if (t.id === 'reset-w') { state.w = equalWeights(); }
      else if (t.id === 'reset') {
        state.w = equalWeights();
        state.mode = D.defaults.position_weighting;
        state.scen = scenDefault();
        state.tf = null;
      } else return;
      changed();
    });
  }
  var liveTimer = null;
  function changed() {
    syncHash();
    updateControls();
    renderResults();
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () {
      if (state.route !== 'home') return;
      var c = compute();
      $('live').textContent = 'הדירוג עודכן. במקום הראשון: ' + c.list[0].party.name_he + ', ציון ' + dec1(c.list[0].score_100) + '.';
    }, 600);
  }

  /* ---------- pages ---------- */

  function render(focus) {
    var app = $('app');
    document.querySelectorAll('nav.main a').forEach(function (a) {
      var on = a.getAttribute('data-nav') === (state.route === 'polls' ? 'polls' : 'home');
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('intro').hidden = state.route !== 'home';
    var fz = $('freeze-banner'), f = D.meta.freeze;
    fz.hidden = !isFrozen();
    if (!fz.hidden) fz.innerHTML = '<strong>' + esc(f.notice_he.split('. ')[0].replace(/\.$/, '')) + '</strong>' + esc(f.notice_he.split('. ').slice(1).join('. '));
    var intro = $('intro'), mainEl = $('main');
    if (intro.parentNode !== mainEl) mainEl.insertBefore(intro, app);
    var site = CFG.site_name_he || document.title;
    if (state.route === 'polls') {
      app.innerHTML = ltrRanges(pollsPage());
      document.title = 'סקרים — ' + site;
    } else if (state.route === 'candidate') {
      app.innerHTML = '<div id="results"></div>';
      renderResults();
      document.title = idx.cand[state.cid].name_he + ' — ' + site;
    } else {
      app.innerHTML = state.route === 'home'
        ? '<div class="home-layout" id="home-layout"><aside class="rail-wrap" aria-label="הגדרות">' + controlsHtml(true) + '</aside><div id="results"></div></div>'
        : '<div class="layout"><div id="results"></div><aside>' + controlsHtml(false) + '</aside></div>';
      if (state.route === 'home') $('home-layout').insertBefore(intro, $('results'));
      bindControls();
      updateControls();
      renderResults();
      document.title = state.route === 'party' ? idx.party[state.slug].name_he + ' — ' + site : site;
    }
    app.querySelectorAll('[data-copy]').forEach(bindCopy);
    if (focus) {
      window.scrollTo(0, 0);
      var h = app.querySelector('h1') || $('main');
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }
  function bindCopy(b) { b.addEventListener('click', function () { copyText(b.getAttribute('data-copy')); }); }
  function renderResults() {
    var el = $('results');
    if (!el) return;
    if (state.route === 'party') el.innerHTML = ltrRanges(partyPage());
    else if (state.route === 'candidate') el.innerHTML = ltrRanges(candidatePage());
    else el.innerHTML = ltrRanges(homePage());
    el.querySelectorAll('[data-copy]').forEach(bindCopy);
    el.querySelectorAll('details.rk-d').forEach(function (d) {
      d.addEventListener('toggle', function () { state.openRows[d.getAttribute('data-slug')] = d.open; });
    });
  }

  function homePage() {
    var c = compute();
    var seatsLabel = isAverage() ? '<span title="' + AVG_LABEL + '">ממוצע ערוצים</span>' : 'בסקר';
    var tieNote = c.key && c.allTied ? '<p class="small">לפי הנתונים הקיימים (' + esc(scenName()) + ') ההבדלים בין הרשימות אינם מובהקים סטטיסטית: כל ' + (COUNT_HE[c.list.length] || c.list.length) + ' הרשימות נמצאות בטווח אי-ודאות משותף.</p>' : '';
    var rows = c.list.map(function (r) {
      var p = r.party, v = r.view;
      return '<li><details class="rk-d" data-slug="' + p.slug + '"' + (state.openRows[p.slug] ? ' open' : '') + '>' +
        '<summary class="rk-row"><span class="rk-place">' + esc(r.rank_label) + '</span><span class="rk-name">' + esc(p.name_he) + '</span>' +
        '<span class="rk-seats">' + num(v.seats) + '</span><span class="rk-score">' + dec1(r.score_100) + '</span></summary>' +
        '<div class="rk-more"><div class="win">' + windowLine(p) + '</div>' + scoreBlock(r) + tieNote +
        '<p><a href="' + href('party/' + p.slug) + '">לדף הרשימה והמועמדים</a></p></div></details></li>';
    }).join('');
    return '<div class="rk-head" aria-hidden="true"><span>מקום</span><span>רשימה</span><span>' + seatsLabel + '</span><span>ציון</span></div>' +
      '<ol class="rk" aria-label="דירוג הרשימות">' + rows + '</ol>' +
      '<p class="rk-foot">הציון (<span dir="ltr">0–100</span>) הוא ממוצע משוקלל של ציוני המועמדים המתנדנדים בכל קריטריון. פירוט מלא ב<a href="methodology.html">דף המתודולוגיה</a>.</p>' +
      shareBar('דירוג רשימות האופוזיציה לפי המועמדים המתנדנדים');
  }

  function partyPage() {
    var p = idx.party[state.slug], r = resultFor(p.slug), W = S.normalizeWeights(state.w), v = sp(p);
    var pw = S.positionWeights(v, state.mode);
    var byPos = idx.candByParty[p.slug] || {};
    var maxW = Math.max.apply(null, pw.map(function (e) { return e.weight; }));
    var bars = pw.map(function (e) {
      var c = byPos[e.position];
      return '<li><span>מקום ' + e.position + (c ? ' · <a href="' + href('candidate/' + c.id) + '">' + esc(c.name_he) + '</a>' : '') + '</span>' +
        '<span class="bar" aria-hidden="true"><span style="width:' + (e.weight / maxW * 100) + '%"></span></span>' +
        '<span class="num">' + pct(e.weight) + '</span></li>';
    }).join('');
    var rows = D.criteria.map(function (c) {
      var pc = r.criteria[c.key];
      return '<tr><td>' + esc(c.name_he) + '</td><td class="n">' + pct(W[c.key]) + '</td><td class="n">' + int(pc.score * 25) + '</td>' +
        '<td class="n">' + pct(pc.coverage) + '</td><td class="n">' + (pc.known_mean === null ? '—' : int(pc.known_mean * 25)) + '</td></tr>';
    }).join('');
    var cards = pw.map(function (e) { return byPos[e.position] ? candCard(byPos[e.position], e.weight) : ''; }).join('');
    var meta = [];
    if (p.leader_he) meta.push('בראש הרשימה: ' + esc(p.leader_he));
    if (p.components_he && p.components_he.length) meta.push('מרכיבים: ' + esc(p.components_he.join(', ')));
    return '<nav class="crumbs" aria-label="מיקום"><a href="' + href('') + '">דירוג</a> › ' + esc(p.name_he) + '</nav>' +
      '<h1>' + esc(p.name_he) + '</h1>' +
      (meta.length ? '<p class="muted small">' + meta.join(' · ') + '</p>' : '') +
      '<div class="card"><div class="win">מקום בדירוג: <b>' + esc(r.rank_label) + '</b> · ' + windowLine(p) + '</div>' + scoreBlock(r) +
      (v.threshold && v.threshold.note_he ? '<p class="small">' + esc(v.threshold.note_he) + '</p>' : '') + '</div>' +
      '<p class="declaration">הדירוג משקף את סדר העדיפויות שקבע מפעיל האתר ואינו המלצת הצבעה. <a href="methodology.html">איך מחושב הציון</a>.</p>' +
      '<h2>המקומות המתנדנדים ומשקלם</h2>' +
      '<p class="small muted">' + (state.mode === 'equal'
        ? 'בחרתם משקל שווה לכל מקום בחלון.'
        : (v.window.method === 'threshold_block'
          ? (v.window.note_he ? '' : 'אם הרשימה עוברת את אחוז החסימה, כל המקומות בחלון נכנסים יחד, ולכן לכולם משקל שווה.')
          : 'משקל כל מקום הוא הסיכוי היחסי שקול נוסף לרשימה יכריע דווקא את המושב הזה, לפי ' + (isAverage() ? AVG_LABEL + ' והפיזור ביניהם.' : 'תוצאת הסקר הנבחר ומרווח הטעות שלו.'))) + '</p>' +
      (v.window.note_he ? '<p class="small">' + esc(v.window.note_he) + '</p>' : '') +
      '<ul class="wbars">' + bars + '</ul>' +
      '<h2>פירוט לפי קריטריון</h2><div class="tbl-wrap"><table class="crit-table"><thead><tr><th scope="col">קריטריון</th><th scope="col">משקל</th><th scope="col">ציון הרשימה (0–100)</th><th scope="col">ידוע מהחלון</th><th scope="col">ממוצע הידוע</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h2>המועמדים בחלון</h2><div class="cgrid">' + cards + '</div>' +
      partyLayer(p) +
      shareBar(p.name_he + ': המועמדים המתנדנדים');
  }

  function candCard(c, weight) {
    var rows = D.criteria.map(function (k) {
      return '<div class="crow"><span class="cname">' + esc(k.short_he) + '</span>' + levelView(c.criteria[k.key], k.key) + '</div>';
    }).join('');
    return '<article class="ccard"><h3><a href="' + href('candidate/' + c.id) + '">' + esc(c.name_he) + '</a></h3>' +
      '<div class="pos">מקום ' + c.position + ' · משקל בחלון ' + pct(weight) + '</div>' +
      (c.political_record ? '' : '<div class="badges"><span class="badge newc">מועמד/ת חדש/ה, אין רקורד פוליטי</span></div>') +
      rows + compositeLine(c) + '</article>';
  }
  function compositeLine(c) {
    var cp = S.candidateComposite(c, state.w);
    return '<div class="composite">ציון כולל: <b>' + dec1(cp.value_100) + '</b> מתוך 100 <span class="muted">(ידוע ' + pct(cp.known_share) + ' ממשקל הקריטריונים; אין מידע נספר כ-0)</span></div>';
  }

  function partyLayer(p) {
    var L = p.party_layer || {};
    var lv = '';
    if (L.levels) {
      var items = D.criteria.filter(function (c) { return L.levels[c.key]; }).map(function (c) {
        var x = L.levels[c.key];
        return '<li>' + esc(c.name_he) + ': ' + num(x.level) + ' מתוך 4' + (CONF[x.confidence] ? ' (' + CONF[x.confidence] + ')' : '') + '</li>';
      });
      if (items.length) lv = '<h3>הערכת שכבת המפלגה</h3><ul class="small">' + items.join('') + '</ul>';
    }
    var evs = (L.evidence_ids || []).map(function (id) { return idx.ev[id]; }).filter(Boolean).map(function (e) { return evItem(e, null, true); }).join('');
    return '<section class="party-layer" aria-labelledby="pl-h"><span class="tag">שכבת המפלגה</span>' +
      '<h2 id="pl-h">התחייבויות ומבנה המפלגה</h2>' +
      '<p class="small"><b>מוצג בנפרד ואינו נכנס לשום ציון.</b> אלה ראיות על הרשימה ועל ראשיה, לא על המועמדים עצמם.</p>' +
      (L.summary_he ? '<p>' + esc(L.summary_he) + '</p>' : '') +
      (L.gap_he ? '<p class="muted">' + esc(L.gap_he) + '</p>' : '') + lv +
      (evs ? '<ul class="ev-list">' + evs + '</ul>' : '') + '</section>';
  }

  function evItem(e, cell, partyLayer) {
    var v = VER[e.verification] || VER.unverified;
    var sa = cell && cell.strong_act_ids && (cell.strong_act_ids['for'].indexOf(e.id) >= 0 || cell.strong_act_ids.against.indexOf(e.id) >= 0);
    var head = [fmtDate(e.date), esc(e.outlet || ''), KIND[e.kind] || '', SRC[e.source_type] || ''].filter(Boolean).join(' · ');
    var b = '<span class="badge ' + v[0] + '">' + v[1] + '</span>';
    if (e.transcript_kind === 'auto' || e.transcript_kind === 'third-party-auto') {
      b += '<span class="badge v-un" title="' + TRANSCRIPT_NOTE + '">תמלול אוטומטי <span aria-hidden="true">&#9432;</span><span class="sr-only">: ' + TRANSCRIPT_NOTE + '</span></span>';
    } else if (e.transcript_kind === 'manual') {
      b += '<span class="badge">תמלול</span>';
    }
    if (!partyLayer && !e.counted) b += '<span class="badge notcounted">לא נכלל בציון</span>';
    if (sa) b += '<span class="badge sa">מעשה מחייב</span>';
    if (partyLayer && e.proxy_code) b += '<span class="badge">' + esc(e.proxy_code + ' · ' + (PROXY[e.proxy_code] || '')) + '</span>';
    var quote = e.verification === 'verbatim_confirmed' && e.quote_original ? '<q dir="auto">' + esc(e.quote_original) + '</q>' : '';
    if (e.display_note) quote += '<div class="note qnote">' + esc(e.display_note) + '</div>';
    var dir = !partyLayer && e.direction && e.direction !== 'neutral' ? '<span class="note">כיוון הראיה: ' + DIR[e.direction] + '</span> ' : '';
    return '<li class="ev' + (!partyLayer && !e.counted ? ' uncounted' : '') + '"><div class="head">' + head + ' ' + b + '</div>' +
      '<div>' + esc(e.summary_he) + '</div>' + quote +
      (e.note_he ? '<div class="note">' + esc(e.note_he) + '</div>' : '') +
      '<div class="small">' + dir + extLink(e.url, e.timestamp ? 'צפייה מ-' + e.timestamp : 'למקור') + '</div></li>';
  }

  function candidatePage() {
    var c = idx.cand[state.cid], p = idx.party[c.party_slug];
    var evs = idx.evByCand[c.id] || {};
    var bio = c.bio || {};
    var bioHtml = '<p>' + esc(bio.summary_he || '') + '</p>';
    if (bio.roles_he && bio.roles_he.length) bioHtml += '<h3>תפקידים</h3><ul>' + bio.roles_he.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (bio.party_history && bio.party_history.length) bioHtml += '<h3>היסטוריה מפלגתית</h3><ul>' + bio.party_history.map(function (h) {
      var when = period(h.from, h.to);
      return '<li>' + esc(h.party_he) + (when ? ': ' + when : '') + '</li>';
    }).join('') + '</ul>';
    var src = (bio.source_ids || []).map(function (id) { return idx.ev[id]; }).filter(Boolean);
    if (src.length) {
      var allUnverified = src.every(function (e) { return e.verification === 'unverified'; });
      bioHtml += '<p class="small">' + (allUnverified ? 'מקורות לרקע (לא נבדקו מול המקור; לא משמשים לציון)' : 'מקורות לרקע (לא משמשים לציון)') + ': ' +
        src.map(function (e) { return extLink(e.url, e.outlet || 'מקור') + (!allUnverified && e.verification === 'unverified' ? ' (לא נבדק)' : ''); }).join(' · ') + '</p>';
    }
    if (c.legal_status && c.legal_status.status_he && c.legal_status.response_he) {
      bioHtml += '<div class="unk-box"><b>הליך משפטי (לא נכנס לניקוד):</b> ' + esc(c.legal_status.status_he) + ' <b>תגובת המועמד/ת:</b> ' + esc(c.legal_status.response_he) + '</div>';
    }
    var secs = D.criteria.map(function (k) {
      var cell = c.criteria[k.key] || { level: null };
      var list = (evs[k.key] || []).slice().sort(function (a, b) { return (b.counted ? 1 : 0) - (a.counted ? 1 : 0) || String(b.date).localeCompare(String(a.date)); });
      var body;
      if (cell.level === null || cell.level === undefined) {
        body = '<div class="unk-box">אין מידע. בציון נספר כ-0.' +
          (cell.searched_he ? '<br>' + esc(cell.searched_he) : '') +
          (cell.unverified_only ? '<br><b>יש פריטים שלא אומתו.</b> הם מוצגים למטה ואינם נכנסים לציון.' : '') + '</div>';
      } else {
        body = (cell.rationale_he ? '<p><b>נימוק:</b> ' + esc(cell.rationale_he) + '</p>' : '');
      }
      return '<section class="crit-sec" aria-labelledby="h-' + k.key + '"><h3 id="h-' + k.key + '">' + esc(k.name_he) + ' ' + levelView(cell, k.key) + ' ' + confView(cell.confidence) +
        (cell.agreement ? '<span class="badge">' + AGREE[cell.agreement] + '</span>' : '') + '</h3>' +
        '<p class="small muted">' + esc(k.description_he || '') + '</p>' + body +
        (list.length ? '<ul class="ev-list">' + list.map(function (e) { return evItem(e, cell, false); }).join('') + '</ul>' : '') + '</section>';
    }).join('');
    return '<nav class="crumbs" aria-label="מיקום"><a href="' + href('') + '">דירוג</a> › <a href="' + href('party/' + p.slug) + '">' + esc(p.name_he) + '</a> › ' + esc(c.name_he) + '</nav>' +
      '<h1>' + esc(c.name_he) + '</h1>' +
      (c.name_en ? '<p class="muted small" dir="ltr" lang="en" style="text-align:right">' + esc(c.name_en) + '</p>' : '') +
      '<p>מקום ' + c.position + ' ב' + esc(p.name_he) + ' · ' + (weightOf(p, c.position) > 0 ? 'משקל המקום בחלון: ' + pct(weightOf(p, c.position)) : 'מחוץ לחלון') + ' (לפי ' + esc(scenName()) + ')</p>' +
      (c.political_record ? '' : '<div class="badges"><span class="badge newc">מועמד/ת חדש/ה, אין רקורד פוליטי</span></div>') +
      '<div class="card"><h2 style="margin-top:0">רקע</h2>' + bioHtml + '</div>' +
      '<div class="card"><h2 style="margin-top:0">לפי קריטריון</h2>' + compositeLine(c) +
      '<p class="small muted">הציון הכולל של מועמד/ת מוצג להמחשה. הדירוג של הרשימות מחושב לפי קריטריון, ולא מממוצע של ציונים כוללים. ' +
      'סימון הביטחון: עיגול מלא, חצי מלא או ריק. "אין מידע" מוצג באפור עם "?" ונספר כ-0, בנפרד מרמה 0 שנקבעה מראיות.</p>' + secs + '</div>' +
      shareBar(c.name_he + ' (' + p.name_he + ')');
  }

  function pollsPage() {
    var P = D.polls, pw = D.meta.poll_window;
    var parties = D.parties.slice().sort(function (a, b) { return b.polls.mean - a.polls.mean; });
    var avg = parties.map(function (p) {
      var s = P.summary[p.slug] || {};
      return '<tr><td data-label="רשימה"><a href="' + href('party/' + p.slug) + '">' + esc(p.name_he) + '</a></td>' +
        '<td class="n" data-label="ממוצע">' + num(s.mean) + '</td><td class="n" data-label="חציון">' + num(s.median) + '</td>' +
        '<td class="n" data-label="טווח">' + num(s.min) + '–' + num(s.max) + '</td>' +
        '<td class="n" data-label="מעל אחוז החסימה">' + s.polls_passing + ' מתוך ' + s.polls_total + '</td>' +
        '<td class="n" data-label="חלון המתנדנדים">' + p.window.from + '–' + p.window.to + '</td></tr>';
    }).join('');
    var complete = P.list.filter(function (x) { return x.details_complete && !x.excluded_by_policy; });
    var notes = [P.footnote_he, P.exclusion_footnote_he].filter(Boolean).map(function (n) { return '<p class="footnote">' + esc(n) + '</p>'; }).join('');
    var head = '<th scope="col">הסקר ופרטיו</th>' +
      parties.map(function (p) { return '<th scope="col" class="n seat">' + esc(p.name_he) + '</th>'; }).join('');
    var rows = complete.map(function (x) {
      var dl = [
        ['המזמין', esc(x.commissioner) + (x.outlet && x.outlet !== x.commissioner ? ' (פורסם ב' + esc(x.outlet) + ')' : '')],
        ['עבודת שטח', '<bdi dir="ltr">' + shortRange(x.fieldwork_from, x.fieldwork_to) + '</bdi> · פורסם <bdi dir="ltr">' + fmtDate(x.published) + '</bdi>'],
        ['האוכלוסייה', esc(x.population_he)],
        ['נשאלים / משיבים', '<bdi dir="ltr">' + x.sample_asked + '</bdi> / <bdi dir="ltr">' + x.sample_responded + '</bdi> · מרווח טעות <bdi dir="ltr">±' + num(x.margin_of_error_pct) + '%</bdi>'],
        ['השאלה', esc(x.questions_he)],
        ['מקורות', extLink(x.cec_url, 'דיווח לוועדת הבחירות') + ' · ' + extLink(x.url, 'הפרסום')]
      ].map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('');
      var tag = x.in_average ? '<span class="badge v-ok">בממוצע</span>' : (x.in_average === false ? '<span class="badge">לא בממוצע: יש סקר מאוחר יותר של אותו ערוץ</span>' : '');
      return '<tr' + (x.in_average === false ? ' class="not-avg"' : '') + '><td class="poll" data-label="הסקר"><b>' + esc(x.pollster) + '</b> ' + tag + '<dl class="pd">' + dl + '</dl></td>' +
        parties.map(function (p) { var v = x.seats[p.slug]; return '<td class="n seat" data-label="' + esc(p.name_he) + '">' + (v === null || v === undefined ? '—' : v) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<h1>סקרים</h1>' +
      '<p>הסקרים קובעים איפה נמצא חלון המתנדנדים של כל רשימה ומה משקל כל מקום בו. ברירת המחדל היא ' + AVG_LABEL + ': ' + pw.n_polls + ' סקרים, עבודת שטח בין ' + fmtDate(pw.from) + ' ל-' + fmtDate(pw.to) + '. הסקרים שנכנסים לממוצע מסומנים בטבלה; האחרים מוצגים לעיון בלבד.</p>' +
      '<h2>' + esc(P.average_label_he) + '</h2><div class="tbl-wrap"><table class="data resp"><thead><tr><th scope="col">רשימה</th><th scope="col" class="n">ממוצע</th><th scope="col" class="n">חציון</th><th scope="col" class="n">טווח</th><th scope="col" class="n">מעל אחוז החסימה</th><th scope="col" class="n">חלון המתנדנדים</th></tr></thead><tbody>' + avg + '</tbody></table></div>' + notes +
      '<h2>הסקרים</h2>' +
      '<p class="small">מוצגים רק סקרים שפורסמו עם כל הפרטים שהחוק מחייב: מכון הסקרים, המזמין, מועדי עבודת השטח, האוכלוסייה, מספר הנשאלים והמשיבים, מרווח הטעות, השאלה וקישור לדיווח לוועדת הבחירות.</p>' +
      (rows ? '<div class="tbl-wrap"><table class="data resp polls"><thead><tr>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="card">אין כרגע סקרים שפורסמו עם כל הפרטים הנדרשים.</p>') +
      '<p class="footnote">מספרים הם מנדטים. 0 פירושו מתחת לאחוז החסימה; — פירושו שהרשימה לא דווחה בסקר.</p>' +
      shareBar('סקרים — ' + (CFG.site_name_he || ''));
  }

  function renderCorrections() {
    var el = $('corrections');
    if (!el) return;
    var list = (D.corrections || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    el.innerHTML = list.length ? '<ul class="corr-list">' + list.map(function (c) {
      return '<li><b>' + fmtDate(c.date) + '</b> · ' + ltrRanges(esc(c.summary_he)) + (c.source_url ? ' · ' + extLink(c.source_url, 'מקור') : '') + '</li>';
    }).join('') + '</ul>' : '<p class="muted">עדיין לא נרשמו תיקונים.</p>';
  }

  load();
})();
