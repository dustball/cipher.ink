/* cipher.ink Secret Santa: the draw. Who gives to whom, chosen uniformly at random among every valid assignment.
 *
 * A valid assignment is a permutation `to` of 0..n-1 where nobody draws themselves (to[i] !== i), nobody draws someone
 * they are excluded from, and, in one-big-loop mode, everyone sits on a single cycle (follow to[] from anyone and you
 * visit all n people before coming back).
 *
 * How: a uniformly random permutation (Fisher-Yates; Sattolo's variant for one loop, which gives a uniformly random
 * single cycle), redrawn until it is valid (rejection). Every valid assignment is equally likely, because every
 * permutation was. With no rules, about 1 in e draws is already valid, so this takes a handful of tries. If 200,000 tries
 * all fail, the rules are tight: the code then decides exactly whether any valid assignment exists (Hall's theorem, via a
 * bipartite matching; a cycle search for one-loop mode), says who makes it impossible, and, when it is possible but rare,
 * lists every valid assignment and picks one of them uniformly.
 *
 * What it never does: send anything anywhere. It runs in the organizer's browser, and only the sealed cards leave it.
 * Plain ES2017, UMD so tests/santa.test.mjs can run it in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.SantaDraw = factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  /* A fair integer in [0, n): the same rejection sampling as the site's Cipher.randInt (crypto.js), drawing from
   * crypto.getRandomValues, but 1,024 numbers at a time, because a tight draw can use millions of them. */
  var pool = new Uint32Array(1024), left = 0;
  function defaultRandInt(n) {
    var lim = Math.floor(4294967296 / n) * n, x;
    do {
      if (!left) { root.crypto.getRandomValues(pool); left = pool.length; }
      x = pool[--left];
    } while (x >= lim);
    return x % n;
  }

  /* allowed[i][j] is true when i may give to j. Exclusions are groups of indices whose members can't draw each other
   * (both directions). */
  function allowedMatrix(n, groups) {
    var a = [];
    for (var i = 0; i < n; i++) { a.push([]); for (var j = 0; j < n; j++) a[i].push(i !== j); }
    (groups || []).forEach(function (g) {
      g.forEach(function (x) { g.forEach(function (y) { if (x !== y) a[x][y] = false; }); });
    });
    return a;
  }

  function valid(to, allowed, loop) {
    var n = to.length, seen = [];
    for (var i = 0; i < n; i++) {
      if (!allowed[i][to[i]] || seen[to[i]]) return false;
      seen[to[i]] = true;
    }
    if (loop) {
      var k = 0, steps = 0;
      do { k = to[k]; steps++; } while (k !== 0 && steps <= n);
      if (steps !== n) return false;
    }
    return true;
  }

  /* One uniformly random permutation, or null as soon as it is clearly invalid. Fisher-Yates picks j in [0, k];
   * Sattolo's algorithm picks j in [0, k), which yields every single n-cycle equally often. Once step k has run, p[k]
   * never changes again, so a forbidden p[k] means this permutation would be rejected anyway: stopping there skips
   * random numbers whose values could not matter, and leaves the accepted draws exactly as uniform. */
  function shuffle(n, randInt, loop, allowed) {
    var p = [];
    for (var i = 0; i < n; i++) p.push(i);
    for (var k = n - 1; k > 0; k--) {
      var j = loop ? randInt(k) : randInt(k + 1), t = p[k];
      p[k] = p[j]; p[j] = t;
      if (allowed && !allowed[k][p[k]]) return null;
    }
    if (allowed && !allowed[0][p[0]]) return null;
    return p;
  }

  /* Perfect matching of givers to receivers over `allowed` (Kuhn's augmenting paths; n is at most 60). Returns
   * {ok, match} or, when there is none, the set of givers Hall's theorem blames: people who between them can only
   * give to fewer people than they are. */
  function matching(allowed) {
    var n = allowed.length, recv = [], give = [];
    for (var i = 0; i < n; i++) { recv.push(-1); give.push(-1); }
    function augment(u, seen) {
      for (var v = 0; v < n; v++) {
        if (!allowed[u][v] || seen[v]) continue;
        seen[v] = true;
        if (recv[v] < 0 || augment(recv[v], seen)) { recv[v] = u; give[u] = v; return true; }
      }
      return false;
    }
    for (var u = 0; u < n; u++) {
      if (!augment(u, [])) {
        // u is unmatched. Everyone reachable from u along alternating paths forms a Hall violator.
        var gs = {}, rs = {}, stack = [u];
        gs[u] = true;
        while (stack.length) {
          var x = stack.pop();
          for (var w = 0; w < n; w++) if (allowed[x][w] && !rs[w]) {
            rs[w] = true;
            var y = recv[w];
            if (y >= 0 && !gs[y]) { gs[y] = true; stack.push(y); }
          }
        }
        return { ok: false, givers: Object.keys(gs).map(Number), receivers: Object.keys(rs).map(Number) };
      }
    }
    return { ok: true, match: give };
  }

  /* Every valid assignment, by depth-first search, stopping once `cap` are found or `budget` steps are spent.
   * Returns {list, complete}. */
  function enumerate(allowed, loop, cap, budget) {
    var n = allowed.length, list = [], to = [], used = [], steps = 0, complete = true;
    for (var i = 0; i < n; i++) { to.push(-1); used.push(false); }
    if (loop) {
      // Walk the cycle from person 0: path[0] = 0 gives to path[1], who gives to path[2], …, and path[n-1] gives to 0.
      var path = [0]; used[0] = true;
      (function walk() {
        if (list.length >= cap || ++steps > budget) { complete = false; return; }
        var last = path[path.length - 1];
        if (path.length === n) {
          if (allowed[last][0]) { var t = []; for (var k = 0; k < n; k++) t[path[k]] = path[(k + 1) % n]; list.push(t); }
          return;
        }
        for (var v = 1; v < n; v++) {
          if (used[v] || !allowed[last][v]) continue;
          used[v] = true; path.push(v);
          walk();
          path.pop(); used[v] = false;
          if (!complete) return;
        }
      })();
    } else {
      (function place(i) {
        if (list.length >= cap || ++steps > budget) { complete = false; return; }
        if (i === n) { list.push(to.slice()); return; }
        for (var v = 0; v < n; v++) {
          if (used[v] || !allowed[i][v]) continue;
          used[v] = true; to[i] = v;
          place(i + 1);
          used[v] = false; to[i] = -1;
          if (!complete) return;
        }
      })(0);
    }
    return { list: list, complete: complete };
  }

  function names(idx, people) { return idx.map(function (i) { return people[i]; }); }
  function andList(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  /* Why no valid assignment exists, in words. */
  function explain(allowed, loop, people) {
    var n = allowed.length;
    for (var i = 0; i < n; i++) {
      var out = 0, inn = 0;
      for (var j = 0; j < n; j++) { if (allowed[i][j]) out++; if (allowed[j][i]) inn++; }
      if (!out) return people[i] + ' is excluded from everyone but themselves, so there is nobody left for them to draw.';
      if (!inn) return 'Nobody is allowed to draw ' + people[i] + '.';
    }
    var m = matching(allowed);
    if (!m.ok) {
      var g = names(m.givers, people), r = names(m.receivers, people);
      return andList(g) + ' can only give to ' + andList(r) + ' between them: ' + g.length + ' people for ' + r.length +
        (r.length === 1 ? ' recipient' : ' recipients') + '. Remove an exclusion that involves them.';
    }
    return '';
  }

  /* The draw. opt: {groups: [[i, j, …], …], loop: bool, randInt: fn, tries: 200000}.
   * Returns {ok: true, to: [...] } or {ok: false, reason: '…'}. `people` (names) is only used for the reason. */
  function draw(n, opt, people) {
    opt = opt || {};
    people = people || [];
    var randInt = opt.randInt || defaultRandInt, loop = !!opt.loop, tries = opt.tries || 200000;
    if (n < 3) return { ok: false, reason: 'A Secret Santa needs at least 3 people.' };
    var allowed = allowedMatrix(n, opt.groups);
    for (var t = 0; t < tries; t++) {
      var p = shuffle(n, randInt, loop, allowed);
      if (p && valid(p, allowed, loop)) return { ok: true, to: p, tries: t + 1 };
    }
    var why = explain(allowed, loop, people);
    if (why) return { ok: false, reason: why };
    // Possible, but valid draws are rarer than 1 in 200,000. List them all (if there are few enough) and pick one fairly.
    var e = enumerate(allowed, loop, 200000, 2000000);
    if (e.list.length && e.complete) return { ok: true, to: e.list[randInt(e.list.length)], tries: tries, exact: e.list.length };
    if (!e.list.length && e.complete) return { ok: false, reason: loop ? 'No single loop fits these exclusions. Turn off one big loop, or remove an exclusion.' : 'No draw fits these exclusions.' };
    return { ok: false, reason: 'These rules leave so few possible draws that a fair one cannot be picked quickly. Remove an exclusion or two.' };
  }

  /* --- counting, for the article's calculator (exact, BigInt) --- */
  function fact(n) { var f = 1n; for (var i = 2n; i <= BigInt(n); i++) f *= i; return f; }

  /* Derangements of n (nobody draws themselves): D(n) = n·D(n-1) + (-1)^n. */
  function derangements(n) {
    var d = 1n;
    for (var i = 1; i <= n; i++) d = BigInt(i) * d + (i % 2 ? -1n : 1n);
    return d;
  }

  /* Valid draws for n people of whom `couples` disjoint pairs may not draw each other: inclusion-exclusion over the
   * forbidden squares (rook polynomial). A couple's forbidden squares form a full 2×2 block, rook polynomial
   * 1 + 4x + 2x²; everyone else forbids only themselves, 1 + x. The count is Σ (-1)^k r_k (n-k)!. */
  function countWithCouples(n, couples) {
    if (2 * couples > n) return 0n;
    var poly = [1n];
    function mul(q) {
      var r = [];
      for (var i = 0; i < poly.length + q.length - 1; i++) r.push(0n);
      for (var a = 0; a < poly.length; a++) for (var b = 0; b < q.length; b++) r[a + b] += poly[a] * q[b];
      poly = r;
    }
    for (var c = 0; c < couples; c++) mul([1n, 4n, 2n]);
    for (var s = 0; s < n - 2 * couples; s++) mul([1n, 1n]);
    var total = 0n;
    for (var k = 0; k < poly.length; k++) total += (k % 2 ? -1n : 1n) * poly[k] * fact(n - k);
    return total;
  }

  /* One-big-loop draws for n people with no exclusions: (n-1)! single cycles. */
  function loops(n) { return n < 2 ? 0n : fact(n - 1); }

  /* The chance that pulling names from a hat gives nobody their own name: D(n)/n!, which tends to 1/e. */
  function hatOk(n) { return Number(derangements(n) * 1000000000n / fact(n)) / 1e9; }

  return { draw: draw, valid: valid, allowedMatrix: allowedMatrix, matching: matching, enumerate: enumerate, explain: explain,
    derangements: derangements, countWithCouples: countWithCouples, loops: loops, factorial: fact, hatOk: hatOk };
});
