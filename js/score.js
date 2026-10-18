/*
 * Elec26Score - the only scoring code in the site.
 * Implements docs/SITE_DATA_SCHEMA.md section 11 (schema 2.0, METHODOLOGY v0.6).
 * The Python engine (scripts/score.py) must produce the same numbers.
 *
 *   W_k      = W_k / sum(W)                         criterion weights, renormalised (all zero -> 1/6 each)
 *   w_i      = party.position_weights ("marginal")  or 1/|window| ("equal")
 *   s~_ik    = level_ik if not null, else 0          (no information counts as 0)
 *   S_p      = sum_k W_k sum_i w_i s~_ik
 *   cov_pk   = sum_{i: level known} w_i
 *   cov_p    = sum_k W_k cov_pk
 *   U_p      = number of (position, criterion) cells with no level; total = 6 |window|
 *   P_pk     = sum_{i known} w_i level_ik / cov_pk   (null when cov_pk = 0)
 *   K_p      = sum_{k in G} W_k P_pk / sum_{k in G} W_k,  G = {k: cov_pk >= minCov, W_k > 0}
 *   f_p      = opts.thresholdFactor if given, else party.threshold_factor_default, else 1
 *   score    = f_p S_p   (known score, coverage and per-criterion values are not multiplied)
 *   C_i      = sum_k W_k s~_ik;  known_share = sum_{k known} W_k
 *   x_100    = floor(250 x + 0.5) / 10
 */
(function (root) {
  'use strict';

  var SCHEMA_VERSION = '2.0';
  var CRITERIA = ['cf', 'luc', 'lwp', 'lib', 'jud', 'rol'];
  var UNKNOWN_LEVEL = 0;

  function r100(x) { return x === null || x === undefined ? null : Math.floor(250 * x + 0.5) / 10; }

  function normalizeWeights(W) {
    var sum = 0, out = {};
    CRITERIA.forEach(function (k) { sum += Math.max(0, +W[k] || 0); });
    CRITERIA.forEach(function (k) { out[k] = sum > 0 ? Math.max(0, +W[k] || 0) / sum : 1 / CRITERIA.length; });
    return out;
  }

  function positionWeights(party, mode) {
    var pw = party.position_weights;
    if (mode === 'equal') {
      return pw.map(function (e) { return { position: e.position, weight: 1 / pw.length }; });
    }
    return pw.map(function (e) { return { position: e.position, weight: e.weight }; });
  }

  function levelOf(c, k) {
    var cell = c && c.criteria ? c.criteria[k] : null;
    return cell && cell.level !== undefined ? cell.level : null;
  }

  /* party: anything with position_weights (and optionally threshold_factor_default); candByPos: {position: candidate};
     opts: {weights, mode, minCov, thresholdFactor} */
  function partyScore(party, candByPos, opts) {
    var W = normalizeWeights(opts.weights);
    var pw = positionWeights(party, opts.mode);
    var minCov = opts.minCov === undefined ? 0.25 : opts.minCov;
    var S = 0, cov = 0, gNum = 0, gDen = 0, unknown = 0, per = {};

    CRITERIA.forEach(function (k) {
      var sk = 0, ck = 0, known = 0;
      pw.forEach(function (e) {
        var lvl = levelOf(candByPos[e.position], k);
        if (lvl === null) {
          sk += e.weight * UNKNOWN_LEVEL;
          unknown += 1;
        } else {
          sk += e.weight * lvl;
          ck += e.weight;
          known += e.weight * lvl;
        }
      });
      var P = ck > 0 ? known / ck : null;
      per[k] = { score: sk, coverage: ck, known_mean: P };
      S += W[k] * sk;
      cov += W[k] * ck;
      if (P !== null && ck >= minCov && W[k] > 0) { gNum += W[k] * P; gDen += W[k]; }
    });

    var K = gDen > 0 ? gNum / gDen : null;
    var f = opts.thresholdFactor !== undefined && opts.thresholdFactor !== null ? opts.thresholdFactor
      : (party.threshold_factor_default !== undefined && party.threshold_factor_default !== null ? party.threshold_factor_default : 1);
    return {
      score: f * S,
      score_100: r100(f * S),
      known_score_100: r100(K),
      threshold_factor: f,
      score_unpenalised_100: r100(S),
      coverage: cov,
      unknown_cells: unknown,
      total_cells: pw.length * CRITERIA.length,
      criteria: per
    };
  }

  function candidateComposite(cand, weights) {
    var W = normalizeWeights(weights);
    var value = 0, knownShare = 0;
    CRITERIA.forEach(function (k) {
      var lvl = levelOf(cand, k);
      if (lvl === null) {
        value += W[k] * UNKNOWN_LEVEL;
      } else {
        value += W[k] * lvl;
        knownShare += W[k];
      }
    });
    return { value: value, value_100: r100(value), known_share: knownShare };
  }

  /* results: [{slug, score_100}] -> adds rank and rank_label; equal score_100 values share a place (stable: input order kept within ties) */
  function rankDeterministic(results) {
    var sorted = results.slice().sort(function (a, b) { return b.score_100 - a.score_100; });
    var i = 0;
    while (i < sorted.length) {
      var j = i;
      while (j + 1 < sorted.length && sorted[j + 1].score_100 === sorted[i].score_100) j++;
      for (var t = i; t <= j; t++) {
        sorted[t].rank = i + 1;
        sorted[t].rank_label = i === j ? String(i + 1) : (i + 1) + '–' + (j + 1);
      }
      i = j + 1;
    }
    return sorted;
  }

  function candidatesByParty(candidates) {
    var out = {};
    candidates.forEach(function (c) {
      (out[c.party_slug] = out[c.party_slug] || {})[c.position] = c;
    });
    return out;
  }

  /* Compare JS results with the engine's precomputed by_preset.default values (parties and every poll scenario).
     Returns a list of mismatches. */
  function selfCheck(data, tol) {
    tol = tol === undefined ? 0.05 : tol;
    var bad = [], byParty = candidatesByParty(data.candidates);
    var minCov = data.defaults.known_score_min_coverage;
    function check(label, slug, party) {
      var pre = party.by_preset && party.by_preset['default'];
      if (!pre) { bad.push(label + ': by_preset.default missing'); return; }
      var r = partyScore(party, byParty[slug] || {}, { weights: data.defaults.weights, mode: 'marginal', minCov: minCov });
      ['score_100', 'known_score_100', 'score_unpenalised_100', 'threshold_factor'].forEach(function (f) {
        var a = r[f], b = pre[f];
        if (b === undefined) return;
        if ((a === null) !== (b === null) || (a !== null && Math.abs(a - b) > tol)) bad.push(label + ' ' + f + ': js=' + a + ' data=' + b);
      });
      if (Math.abs(r.coverage - pre.coverage) > 0.002) bad.push(label + ' coverage: js=' + r.coverage + ' data=' + pre.coverage);
      ['unknown_cells', 'total_cells'].forEach(function (f) {
        if (pre[f] !== undefined && r[f] !== pre[f]) bad.push(label + ' ' + f + ': js=' + r[f] + ' data=' + pre[f]);
      });
    }
    data.parties.forEach(function (p) { check(p.slug, p.slug, p); });
    var sc = data.scenarios;
    if (sc && sc.items) {
      Object.keys(sc.items).forEach(function (id) {
        var ps = sc.items[id].parties || {};
        Object.keys(ps).forEach(function (slug) { check(id + ':' + slug, slug, ps[slug]); });
      });
    }
    return bad;
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    CRITERIA: CRITERIA,
    UNKNOWN_LEVEL: UNKNOWN_LEVEL,
    r100: r100,
    normalizeWeights: normalizeWeights,
    positionWeights: positionWeights,
    partyScore: partyScore,
    candidateComposite: candidateComposite,
    rankDeterministic: rankDeterministic,
    candidatesByParty: candidatesByParty,
    selfCheck: selfCheck
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Elec26Score = api;
})(typeof window !== 'undefined' ? window : this);
