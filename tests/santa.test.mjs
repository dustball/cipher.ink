// node tests/santa.test.mjs: the Secret Santa draw (assets/santa-draw.js): every draw is valid, draws are uniform
// (chi-squared), infeasible rules are explained and never hang, exclusions are symmetric, the counts are exact.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const S = require('../assets/santa-draw.js');

let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };

// Chi-squared statistic of observed counts against a uniform expectation.
function chi2(counts, total) {
  const k = counts.size, e = total / k;
  let x = 0;
  for (const c of counts.values()) x += (c - e) * (c - e) / e;
  return x;
}
// Critical values at p = 0.001, so a correct draw fails about once in a thousand runs.
const CRIT = { 8: 26.12, 23: 49.73 };

function tally(n, opt, draws) {
  const m = new Map();
  let allValid = true;
  const allowed = S.allowedMatrix(n, opt.groups);
  for (let i = 0; i < draws; i++) {
    const r = S.draw(n, opt);
    if (!r.ok || !S.valid(r.to, allowed, !!opt.loop)) { allValid = false; break; }
    const k = r.to.join('');
    m.set(k, (m.get(k) || 0) + 1);
  }
  return { m, allValid };
}

// n = 4, no rules: the 9 derangements, uniformly.
{
  const N = 100000, { m, allValid } = tally(4, {}, N);
  ok(allValid, 'n=4: every draw is a valid derangement');
  ok(m.size === 9, 'n=4: all 9 derangements appear (' + m.size + ')');
  const x = chi2(m, N);
  ok(x < CRIT[8], 'n=4: uniform over 100,000 draws (chi-squared ' + x.toFixed(2) + ' < ' + CRIT[8] + ', df 8)');
}

// n = 5, one big loop: the 24 single cycles, uniformly.
{
  const N = 100000, { m, allValid } = tally(5, { loop: true }, N);
  ok(allValid, 'n=5 loop: every draw is a single 5-cycle');
  ok(m.size === 24, 'n=5 loop: all 24 cycles appear (' + m.size + ')');
  const x = chi2(m, N);
  ok(x < CRIT[23], 'n=5 loop: uniform over 100,000 draws (chi-squared ' + x.toFixed(2) + ' < ' + CRIT[23] + ', df 23)');
}

// The exact fallback (forced with tries: 1) is uniform too.
{
  const N = 50000, m = new Map();
  for (let i = 0; i < N; i++) { const r = S.draw(4, { tries: 1 }); const k = r.to.join(''); m.set(k, (m.get(k) || 0) + 1); }
  const x = chi2(m, N);
  ok(m.size === 9 && x < CRIT[8], 'exact fallback: 9 derangements, uniform (chi-squared ' + x.toFixed(2) + ')');
}

// Exclusions apply in both directions, and draws respect them.
{
  const a = S.allowedMatrix(5, [[0, 1], [2, 3, 4]]);
  ok(!a[0][1] && !a[1][0] && !a[2][4] && !a[4][2] && !a[3][2] && a[0][2] && a[2][0], 'exclusions are symmetric');
  const { allValid } = tally(6, { groups: [[0, 1], [2, 3]] }, 5000);
  ok(allValid, 'n=6 with two couples: 5,000 draws all respect the exclusions');
  const L = tally(8, { groups: [[0, 1], [2, 3], [4, 5]], loop: true }, 3000);
  ok(L.allValid, 'n=8 loop with three couples: 3,000 draws, all single cycles that respect the exclusions');
}

// Infeasible inputs are detected, explained by name, and never hang.
{
  const people = ['Ana', 'Ben', 'Cy', 'Di'];
  let t = Date.now(), r = S.draw(3, { groups: [[0, 1], [0, 2]] }, ['Ana', 'Ben', 'Cy']);
  ok(!r.ok && /Ana is excluded from everyone/.test(r.reason), 'n=3, Ana excluded from both others: "' + r.reason + '"');
  r = S.draw(4, { groups: [[0, 1, 2]] }, people);
  ok(!r.ok && /^(Ana|Ben|Cy)(, (Ana|Ben|Cy))*( and (Ana|Ben|Cy)) can only give to Di between them/.test(r.reason), 'n=4, three in one group: Hall violator named: "' + r.reason + '"');
  r = S.draw(4, { groups: [[0, 2], [0, 3]], loop: true }, people);
  ok(!r.ok && /single loop/.test(r.reason), 'n=4, a forced swap: no single loop: "' + r.reason + '"');
  r = S.draw(4, { groups: [[0, 2], [0, 3]] }, people);
  ok(r.ok, 'the same rules without one big loop draw fine');
  r = S.draw(2, {});
  ok(!r.ok, 'two people are refused');
  // 60 people where person 0 may only give to person 1 and only person 1 may give to 0, in one-loop mode: impossible.
  const g = [];
  for (let i = 2; i < 60; i++) g.push([0, i]);
  r = S.draw(60, { groups: g, loop: true }, Array.from({ length: 60 }, (_, i) => 'P' + i));
  ok(!r.ok, 'n=60 loop with a forced swap: refused');
  ok(Date.now() - t < 20000, 'all infeasible cases decided in ' + (Date.now() - t) + ' ms');
}

// Counting: derangements, couples (checked against brute force), loops, the hat.
{
  ok(S.derangements(4) === 9n && S.derangements(10) === 1334961n, 'D(4) = 9, D(10) = 1,334,961');
  ok(S.loops(5) === 24n && S.loops(10) === 362880n, '(n-1)! loops: 24 for 5, 362,880 for 10');
  let agree = true;
  for (let n = 3; n <= 8; n++) for (let c = 0; 2 * c <= n; c++) {
    const groups = []; for (let k = 0; k < c; k++) groups.push([2 * k, 2 * k + 1]);
    const e = S.enumerate(S.allowedMatrix(n, groups), false, 1e9, 1e9);
    if (BigInt(e.list.length) !== S.countWithCouples(n, c)) { agree = false; console.log('     n=' + n + ' c=' + c + ' enum ' + e.list.length + ' formula ' + S.countWithCouples(n, c)); }
  }
  ok(agree, 'couples formula equals brute-force enumeration for n = 3..8, every number of couples');
  const h = 1 - S.hatOk(10);
  ok(Math.abs(h - (1 - 1 / Math.E)) < 1e-6, 'hat failure with 10 people: ' + (h * 100).toFixed(4) + '% (1 - 1/e = ' + ((1 - 1 / Math.E) * 100).toFixed(4) + '%)');
}

// The whole build (assets/santa-lib.js): draw, seal the cards and the organizer's copy, and check what each holds.
{
  const fs = await import('fs');
  eval(fs.readFileSync(new URL('../assets/crypto.js', import.meta.url), 'utf8'));
  globalThis.SantaDraw = S;
  eval(fs.readFileSync(new URL('../assets/santa-lib.js', import.meta.url), 'utf8'));
  const Santa = globalThis.Santa, C = globalThis.Cipher;
  const p = Santa.parse('Ana\n  Ben  \nCy\nDi\nEd', 'Ana, Ben\ncy and di');
  ok(!p.error && p.names.join('|') === 'Ana|Ben|Cy|Di|Ed' && JSON.stringify(p.groups) === '[[0,1],[2,3]]', 'parse: names cleaned, exclusions matched case-insensitively');
  ok(/twice/.test(Santa.parse('Ana\nana\nBen').error || ''), 'parse: duplicate names refused, case-insensitively');
  ok(/not on the list/.test(Santa.parse('Ana\nBen\nCy', 'Ana, Zed').error || ''), 'parse: an unknown name in an exclusion is refused');
  const ex = { title: 'Test', budget: '$25', date: '2026-12-18', note: 'Be kind' };
  const b = await Santa.build({ ex, names: p.names, groups: p.groups, groupNames: p.groupNames, loop: false, me: 'Ana' });
  ok(!b.error && b.params.cards.length === 5, 'build: 5 sealed cards');
  const cards = [];
  for (let i = 0; i < 5; i++) cards.push((await C.open(b.params.cards[i], { linkKey: b.admin.people[i].k })).data);
  const byName = Object.fromEntries(cards.map(c => [c.me.name, c]));
  const to = cards.map(c => p.names.indexOf(c.to.name));
  ok(S.valid(to, S.allowedMatrix(5, p.groups), false), 'build: the cards form a valid draw that respects the exclusions');
  ok(cards.every(c => c.to.lk === byName[c.to.name].me.lk && c.to.tt === byName[c.to.name].me.tt && c.to.slot === byName[c.to.name].me.slot && !('wt' in c.to)),
    'build: each card holds its giftee\'s list key, thread token and slot, never the giftee\'s wishlist token');
  let hashes = true;
  for (let i = 0; i < 5; i++) {
    hashes = hashes && b.params.dels[i] === await C.sha256hex(cards[i].d) && b.params.wkeys[i] === await C.sha256hex(cards[i].me.wt) &&
      b.params.tkeys[i] === await C.sha256hex(cards[i].me.tt) && b.params.slots[i] === cards[i].me.slot;
  }
  ok(hashes, 'build: the server gets only sha256 of each card, wishlist and thread token');
  const admin = await Santa.unbox(b.params.admin, b.ak);
  const flat = JSON.stringify(admin);
  ok(admin.people.length === 5 && !/"to"|"lk"|"wt"|"tt"/.test(flat), 'build: the organizer\'s copy holds names, links and slots but no pairing and no list keys');
  ok(b.params.adm === await C.sha256hex(admin.at) && !flat.includes(cards[0].me.lk), 'build: the admin token is sent only as a hash');
  const w = await Santa.box({ txt: 'socks', t: 1 }, cards[0].me.lk);
  ok((await Santa.unbox(w, cards[0].me.lk)).txt === 'socks', 'wishlist round trip under the list key');
  let wrong = false; try { await Santa.unbox(w, cards[1].me.lk); } catch (e) { wrong = true; }
  ok(wrong, 'a wishlist does not open under someone else\'s list key');
}

console.log(fail ? fail + ' FAILED' : 'all santa tests passed');
process.exit(fail ? 1 : 0);
