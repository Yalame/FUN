// Run with:  node tests/calc.test.js
const assert = require('assert');
const C = require('../calc.js');

const S = JSON.parse(JSON.stringify(C.DEFAULT_SETTINGS));
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    console.error('  ✗ ' + name + '\n    ' + e.message);
    process.exitCode = 1;
  }
}
const byId = (round) => Object.fromEntries(round.results.map((r) => [r.playerId, r]));
const night = (playerIds, rounds, extra = {}) => ({ playerIds, rounds, status: 'finished', date: '2026-11-07', ...extra });

console.log('Round points & money');

test('1 point, 5 players: points 5,4,3,2,1 and winner takes 10 € from each', () => {
  const r = byId(C.buildRound(1, ['A', 'B', 'C', 'D', 'E'], {}, S));
  assert.deepStrictEqual(['A', 'B', 'C', 'D', 'E'].map((x) => r[x].pts), [5, 4, 3, 2, 1]);
  assert.strictEqual(r.A.won, 40);
  assert.strictEqual(r.B.lost, 10);
  assert.strictEqual(r.A.table, 5);
  assert.strictEqual(r.A.pot, 5); // played 10 € → 5 € pot
});

test('2 points, 4 players: points 8,6,4,2', () => {
  const r = byId(C.buildRound(2, ['A', 'B', 'C', 'D'], {}, S));
  assert.deepStrictEqual(['A', 'B', 'C', 'D'].map((x) => r[x].pts), [8, 6, 4, 2]);
  assert.strictEqual(r.A.won, 60); // 3 × 20
  assert.strictEqual(r.A.pot, 10); // played 20 € → 10 € pot
});

test('winner on 5 € gets only 5 € from each player', () => {
  const r = byId(C.buildRound(2, ['A', 'B', 'C', 'D'], { A: 5, B: 20, C: 20, D: 10 }, S));
  assert.strictEqual(r.A.won, 15);
  assert.strictEqual(r.B.lost, 5);
  assert.strictEqual(r.D.lost, 5);
  assert.strictEqual(r.A.pot, 5); // played up to 10 € → 5 € pot
  assert.strictEqual(r.A.table, 5);
  assert.strictEqual(r.A.pts, 8); // points ignore money
});

test('winner on 20 € gets 20 / 10 / 5 € from the 20 / 10 / 5 € players', () => {
  const r = byId(C.buildRound(2, ['A', 'B', 'C', 'D'], { A: 20, B: 20, C: 10, D: 5 }, S));
  assert.strictEqual(r.B.lost, 20);
  assert.strictEqual(r.C.lost, 10);
  assert.strictEqual(r.D.lost, 5);
  assert.strictEqual(r.A.won, 35);
  assert.strictEqual(r.D.pts, 2);
});

test('pot fee (winner only): up to 10 € → 5 €, more than 10 € → 10 €', () => {
  assert.strictEqual(C.potFee(5, S), 5);
  assert.strictEqual(C.potFee(10, S), 5);
  assert.strictEqual(C.potFee(15, S), 10);
  assert.strictEqual(C.potFee(20, S), 10);
  assert.strictEqual(C.potFee(30, S), 10);
});

test('you get and give based on what you play (the team\'s examples)', () => {
  // 4 players play 20 €, the one playing 5 € wins → everyone pays only 5 €
  const a = byId(C.buildRound(2, ['W', 'B', 'C', 'D', 'E'], { W: 5, B: 20, C: 20, D: 20, E: 20 }, S));
  assert.deepStrictEqual(['B', 'C', 'D', 'E'].map((x) => a[x].lost), [5, 5, 5, 5]);
  assert.strictEqual(a.W.won, 20);
  assert.strictEqual(a.W.table, 5); // every winner pays 5 € for the table
  assert.strictEqual(a.W.pot, 5); // played 5 € (up to 10 €) → 5 € to the pot
  // the winner played the full 20 € → the 5 € player pays 5, the 10 € player 10, the 20 € player 20
  const b = byId(C.buildRound(2, ['W', 'B', 'C', 'D'], { W: 20, B: 5, C: 10, D: 20 }, S));
  assert.deepStrictEqual([b.B.lost, b.C.lost, b.D.lost], [5, 10, 20]);
  assert.strictEqual(b.W.won, 35);
  assert.strictEqual(b.W.pot, 10); // played more than 10 € → 10 € to the pot
  // only the winner pays fees
  assert.ok(['B', 'C', 'D'].every((x) => b[x].pot === 0 && b[x].table === 0));
});

test('older saved rules are upgraded once: pot 0 € for a 5 € winner becomes 5 €', () => {
  const old = { ...S, potFeeBelow: 0 };
  delete old.rulesRev;
  assert.strictEqual(C.upgradeRules(old), true);
  assert.strictEqual(old.potFeeBelow, 5);
  assert.strictEqual(old.rulesRev, C.RULES_REV);
  assert.strictEqual(C.upgradeRules(old), false, 'runs only once');
  const custom = { ...S, potFeeBelow: 3 };
  C.upgradeRules(custom);
  assert.strictEqual(custom.potFeeBelow, 3, 'a custom value is kept');
  const later = { ...S, rulesRev: C.RULES_REV, potFeeBelow: 0 };
  assert.strictEqual(C.upgradeRules(later), false, 'a choice made after the upgrade is kept');
  assert.strictEqual(later.potFeeBelow, 0);
});

test('money always adds up to zero (before fees)', () => {
  const rd = C.buildRound(3, ['A', 'B', 'C', 'D', 'E'], { A: 10, B: 30, C: 5, D: 30, E: 10 }, S);
  const sum = rd.results.reduce((a, r) => a + r.won - r.lost, 0);
  assert.strictEqual(C.r2(sum), 0);
});

console.log('Night summary');

test('points add up, champion is most points, pot and table collected', () => {
  const rounds = [
    C.buildRound(1, ['A', 'B', 'C', 'D'], {}, S), // A 4, B 3, C 2, D 1
    C.buildRound(2, ['B', 'A', 'D', 'C'], {}, S), // B 8, A 6, D 4, C 2
  ];
  const sum = C.nightSummary(night(['A', 'B', 'C', 'D'], rounds));
  const p = Object.fromEntries(sum.players.map((x) => [x.playerId, x]));
  assert.strictEqual(p.A.pts, 10);
  assert.strictEqual(p.B.pts, 11);
  assert.deepStrictEqual(sum.champions, ['B']);
  assert.strictEqual(sum.potTotal, 15); // 5 + 10
  assert.strictEqual(sum.tableTotal, 10);
  assert.strictEqual(p.A.money, 30 - 20); // won 30 in round 1, lost 20 in round 2
  assert.strictEqual(p.A.net, 10 - 10); // minus 5 table + 5 pot
});

test('tied top score → two champions', () => {
  const rounds = [C.buildRound(1, ['A', 'B', 'C'], {}, S), C.buildRound(1, ['B', 'A', 'C'], {}, S)];
  const sum = C.nightSummary(night(['A', 'B', 'C'], rounds));
  assert.deepStrictEqual(sum.champions.sort(), ['A', 'B']);
});

test('late joiner: starting points count, money does not change', () => {
  const rounds = [C.buildRound(1, ['A', 'B', 'C'], {}, S), C.buildRound(1, ['A', 'B', 'C', 'D'], {}, S)];
  const n = night(['A', 'B', 'C', 'D'], rounds, { joins: [{ id: 'j1', playerId: 'D', pts: 1, afterRound: 1 }] });
  const p = Object.fromEntries(C.nightSummary(n).players.map((x) => [x.playerId, x]));
  assert.strictEqual(p.D.start, 1);
  assert.strictEqual(p.D.pts, 1 + 1); // start 1 + last place in round 2
  assert.strictEqual(p.D.roundsPlayed, 1);
  assert.strictEqual(p.D.lost, 10);
});

console.log('Bill split');

const fakeSummary = (pts, pot = 0, table = 0) => ({
  potTotal: pot,
  tableTotal: table,
  players: Object.entries(pts).map(([playerId, p]) => ({ playerId, pts: p, rank: 0 })),
});
const linesById = (plan) => Object.fromEntries(plan.lines.map((l) => [l.playerId, l]));

test('4 players: last 50 %, then 30 %, 20 %, winner pays nothing; pot is taken off first', () => {
  const plan = C.billPlan(fakeSummary({ A: 20, B: 15, C: 10, D: 5 }, 30), { invoice: 230, shares: C.sharesFor(4, S) });
  assert.strictEqual(plan.remaining, 200);
  const l = linesById(plan);
  assert.strictEqual(l.D.amount, 100);
  assert.strictEqual(l.C.amount, 60);
  assert.strictEqual(l.B.amount, 40);
  assert.strictEqual(l.A.amount, 0);
});

test('5 and 6 players: 40 / 30 / 20 / 10', () => {
  assert.deepStrictEqual(C.sharesFor(5, S), [40, 30, 20, 10]);
  assert.deepStrictEqual(C.sharesFor(6, S), [40, 30, 20, 10]);
  const plan = C.billPlan(fakeSummary({ A: 30, B: 25, C: 20, D: 15, E: 10, F: 5 }), { invoice: 100, shares: C.sharesFor(6, S) });
  const l = linesById(plan);
  assert.deepStrictEqual(['F', 'E', 'D', 'C', 'B', 'A'].map((x) => l[x].amount), [40, 30, 20, 10, 0, 0]);
});

test('tie on points shares the places: 50 % + 30 % → 40 % each', () => {
  const plan = C.billPlan(fakeSummary({ A: 20, B: 15, C: 5, D: 5 }), { invoice: 100, shares: C.sharesFor(4, S) });
  const l = linesById(plan);
  assert.strictEqual(l.C.pct, 40);
  assert.strictEqual(l.D.pct, 40);
  assert.strictEqual(l.C.amount, 40);
  assert.strictEqual(l.B.amount, 20);
});

test('pot bigger than bill → nothing to pay, leftover shown', () => {
  const plan = C.billPlan(fakeSummary({ A: 2, B: 1 }, 50), { invoice: 30, shares: [100] });
  assert.strictEqual(plan.remaining, 0);
  assert.strictEqual(plan.leftover, 20);
});

test('optional: table money also pays the bill', () => {
  const plan = C.billPlan(fakeSummary({ A: 2, B: 1 }, 20, 15), { invoice: 100, shares: [100], tableToInvoice: true });
  assert.strictEqual(plan.remaining, 65);
});

test('bill shares always add up exactly to the remaining amount', () => {
  const plan = C.billPlan(fakeSummary({ A: 9, B: 7, C: 7, D: 7, E: 1 }, 0), { invoice: 100.01, shares: C.sharesFor(5, S) });
  assert.strictEqual(C.r2(plan.lines.reduce((a, l) => a + l.amount, 0)), 100.01);
});

console.log('Leaving early & extra payments');

const five = ['A', 'B', 'C', 'D', 'E'];
const twoRounds = () => [C.buildRound(1, five, {}, S), C.buildRound(1, ['B', 'A', 'C', 'E', 'D'], {}, S)];

test('someone who leaves early keeps their points but is left out of the bill split', () => {
  const n = night(five, twoRounds(), { leaves: [{ id: 'l1', playerId: 'E', paid: 20, afterRound: 2, at: 5 }] });
  const sum = C.nightSummary(n);
  const p = Object.fromEntries(sum.players.map((x) => [x.playerId, x]));
  assert.strictEqual(p.E.pts, 1 + 2); // last, then 4th
  assert.strictEqual(p.E.left, true);
  assert.strictEqual(sum.leftTotal, 20);
  const plan = C.billPlan(sum, { invoice: 200, shares: C.sharesFor(4, S) });
  // pot: two winners played 10 € → 5 + 5; leaver paid 20 → 200 − 10 − 20 = 170 among the 4 who stayed
  assert.strictEqual(plan.remaining, 170);
  assert.strictEqual(plan.payers, 4);
  assert.ok(!plan.lines.some((l) => l.playerId === 'E'));
  const l = linesById(plan);
  // points: A 5+4=9, B 4+5=9, C 3+3=6, D 2+1=3 → D 50 %, C 30 %, A & B tied on 20 % + 0 % → 10 % each
  assert.strictEqual(l.D.amount, 85);
  assert.strictEqual(l.C.amount, 51);
  assert.strictEqual(l.A.amount, 17);
  assert.strictEqual(l.B.amount, 17);
  assert.strictEqual(plan.byPlayer.E, 20, 'what they paid when leaving counts as their bill');
  assert.strictEqual(C.r2(Object.values(plan.byPlayer).reduce((a, b) => a + b, 0)), 200 - 10);
});

test('extra money toward the bill comes off it for everyone, the payer still takes part in the split', () => {
  const sum = C.nightSummary(night(['A', 'B', 'C', 'D'], [C.buildRound(1, ['A', 'B', 'C', 'D'], {}, S)]));
  const plan = C.billPlan(sum, { invoice: 135, shares: C.sharesFor(4, S), extras: [{ playerId: 'A', amount: 30 }] });
  assert.strictEqual(plan.extrasTotal, 30);
  assert.strictEqual(plan.remaining, 135 - 5 - 30); // 100
  const l = linesById(plan);
  assert.deepStrictEqual([l.D.amount, l.C.amount, l.B.amount, l.A.amount], [50, 30, 20, 0]);
  assert.strictEqual(plan.byPlayer.A, 30);
  assert.strictEqual(plan.byPlayer.D, 50);
});

test('if two phones both saved a leave for the same player, the newest one counts once', () => {
  const n = night(five, twoRounds(), { leaves: [{ id: 'l1', playerId: 'E', paid: 10, at: 5, updatedAt: 5 }, { id: 'l2', playerId: 'E', paid: 25, at: 6, updatedAt: 9 }] });
  assert.strictEqual(C.nightSummary(n).leftTotal, 25);
});

test('bill statistics add up per night and per player', () => {
  const n1 = night(five, twoRounds(), { id: 'n1', date: '2026-11-02', leaves: [{ id: 'l1', playerId: 'E', paid: 20, at: 5 }], bill: { invoice: 200, shares: C.sharesFor(4, S), extras: [{ playerId: 'A', amount: 10 }] } });
  const n2 = night(['A', 'B', 'C', 'D'], [C.buildRound(1, ['D', 'C', 'B', 'A'], {}, S)], { id: 'n2', date: '2026-11-09', bill: { invoice: 105, shares: C.sharesFor(4, S) } });
  const st = C.billStats([n1, n2]);
  assert.strictEqual(st.totals.nights, 2);
  assert.strictEqual(st.totals.invoice, 305);
  assert.strictEqual(st.totals.pot, 15);
  assert.strictEqual(st.totals.left, 20);
  assert.strictEqual(st.totals.extras, 10);
  assert.strictEqual(st.totals.players, 305 - 15 - 20 - 10);
  assert.strictEqual(st.avg, 152.5);
  assert.deepStrictEqual(st.rows.map((r) => r.nightId), ['n2', 'n1'], 'newest night first');
  const sum = st.players.reduce((a, p) => a + p.total, 0);
  assert.strictEqual(C.r2(sum), 305 - 15);
  const e = st.players.find((p) => p.playerId === 'E');
  assert.strictEqual(e.left, 20);
  const agg = Object.fromEntries(C.aggregate([n1, n2]).map((x) => [x.playerId, x]));
  for (const p of st.players) assert.strictEqual(agg[p.playerId].bill, p.total);
  assert.strictEqual(agg.A.billExtra, 10);
  assert.strictEqual(agg.E.leftEarly, 1);
});

console.log('Weekly / monthly standings');

test('aggregate counts champion titles and points across nights', () => {
  const n1 = night(['A', 'B'], [C.buildRound(1, ['A', 'B'], {}, S)], { bill: { invoice: 50, shares: [100] } });
  const n2 = night(['A', 'B'], [C.buildRound(1, ['B', 'A'], {}, S), C.buildRound(1, ['B', 'A'], {}, S)]);
  const st = C.sortStandings(C.aggregate([n1, n2]), 'points');
  assert.strictEqual(st[0].playerId, 'B');
  assert.strictEqual(st[0].champions, 1);
  assert.strictEqual(st[0].pts, 1 + 2 + 2);
  const b = st.find((x) => x.playerId === 'B');
  assert.strictEqual(b.bill, 50 - 5); // B was last in night 1: pays bill minus A's 5 € pot
});

test('fair score: one good night does not beat three good nights; more play counts', () => {
  const win = (order) => C.buildRound(1, order, {}, S);
  // A plays 3 nights (9 rounds) and wins 6; B plays 1 night (3 rounds) and wins 2; C is always there, never wins
  const nA = (i) => night(['A', 'C', 'D'], [win(['A', 'C', 'D']), win(['A', 'D', 'C']), win(['D', 'A', 'C'])], { date: `2026-11-0${i}` });
  const nB = night(['B', 'C', 'D'], [win(['B', 'C', 'D']), win(['B', 'D', 'C']), win(['D', 'B', 'C'])]);
  const st = C.sortStandings(C.aggregate([nA(1), nA(2), nA(3), nB]), 'rating');
  const r = Object.fromEntries(st.map((x) => [x.playerId, x]));
  assert.strictEqual(st[0].playerId, 'A');
  assert.ok(r.A.rating > r.B.rating, 'same win rate, more rounds ranks higher');
  assert.ok(r.B.rating > r.C.rating);
  assert.ok(r.A.pts > r.B.pts * 2, 'plain points would only reward showing up');
  assert.ok(r.A.rating <= 100 && r.C.rating >= 0);
});

test('fair score: a win is a full win at any table size, and a bigger table counts a bit more; no rounds = 50', () => {
  assert.strictEqual(C.fairScore(0, 0), 50);
  const big = night(['A', 'B', 'C', 'D', 'E', 'F'], [C.buildRound(1, ['A', 'B', 'C', 'D', 'E', 'F'], {}, S)]);
  const small = night(['X', 'Y', 'Z'], [C.buildRound(1, ['X', 'Y', 'Z'], {}, S)]);
  const r = Object.fromEntries(C.aggregate([big, small]).map((x) => [x.playerId, x]));
  assert.strictEqual(r.A.avgResult, 100);
  assert.strictEqual(r.X.avgResult, 100);
  assert.strictEqual(r.F.avgResult, 0);
  assert.ok(r.A.rating > r.X.rating && r.X.rating > 50, 'beating 5 players says more than beating 2');
  assert.ok(r.F.rating < r.Z.rating && r.Z.rating < 50);
});

test('fair score: weights scale with the period, so stakes x3 change nothing', () => {
  const mk = (pts) => [
    night(['A', 'B', 'C', 'D'], [C.buildRound(pts, ['A', 'B', 'C', 'D'], {}, S), C.buildRound(pts, ['B', 'A', 'D', 'C'], {}, S)], { date: '2026-11-02' }),
    night(['A', 'B', 'C'], [C.buildRound(pts, ['C', 'A', 'B'], {}, S)], { date: '2026-11-09' }),
  ];
  const one = Object.fromEntries(C.aggregate(mk(1)).map((x) => [x.playerId, x.rating]));
  const three = Object.fromEntries(C.aggregate(mk(3)).map((x) => [x.playerId, x.rating]));
  assert.deepStrictEqual(one, three);
});

test('fair score: one lucky night at high stakes does not beat a strong regular', () => {
  const T = ['L', 'R', 'P', 'Q'];
  // L plays one night of three 3-point rounds and wins them all
  const lucky = night(T, [0, 1, 2].map(() => C.buildRound(3, ['L', 'R', 'P', 'Q'], {}, S)), { date: '2026-11-03' });
  // R plays three more nights of 3-point rounds and is 1st or 2nd every time
  const regular = (d) => night(['R', 'P', 'Q', 'K'], [
    C.buildRound(3, ['R', 'P', 'Q', 'K'], {}, S), C.buildRound(3, ['P', 'R', 'K', 'Q'], {}, S),
    C.buildRound(3, ['R', 'Q', 'P', 'K'], {}, S), C.buildRound(3, ['K', 'R', 'P', 'Q'], {}, S),
    C.buildRound(3, ['R', 'K', 'Q', 'P'], {}, S),
  ], { date: d });
  const st = C.sortStandings(C.aggregate([lucky, regular('2026-11-10'), regular('2026-11-17'), regular('2026-11-24')]), 'rating');
  const r = Object.fromEntries(st.map((x) => [x.playerId, x]));
  assert.ok(r.R.rating > r.L.rating, `regular ${r.R.rating} should beat one lucky night ${r.L.rating}`);
  assert.ok(r.L.provisional && !r.R.provisional);
  assert.strictEqual(st[0].playerId, 'R');
});

test('fair score: a bigger stake counts more, but only by its square root', () => {
  assert.strictEqual(C.roundWeight(4, 4) / C.roundWeight(1, 4), 2);
  assert.ok(Math.abs(C.roundWeight(1, 2) / C.roundWeight(1, 4) - 5 / 9) < 1e-9, 'heads-up counts 5/9 of a 4-player round');
});

test('curves: the last step of the timeline matches the table', () => {
  const nights = [
    night(['A', 'B', 'C'], [C.buildRound(2, ['A', 'B', 'C'], {}, S)], { id: 'n1', date: '2026-11-02', bill: { invoice: 40, shares: [60, 40] } }),
    night(['A', 'B', 'C', 'D'], [C.buildRound(1, ['D', 'C', 'B', 'A'], {}, S), C.buildRound(3, ['B', 'D', 'A', 'C'], {}, S)], { id: 'n2', date: '2026-11-05' }),
  ];
  const steps = C.timeline(nights);
  assert.deepStrictEqual(steps.map((s) => s.nightId), ['n1', 'n2']);
  assert.ok(!steps[0].standings.some((x) => x.playerId === 'D'), 'D appears from the night they first played');
  const last = Object.fromEntries(steps[1].standings.map((x) => [x.playerId, x]));
  for (const a of C.aggregate(nights)) {
    assert.strictEqual(last[a.playerId].rating, a.rating);
    assert.strictEqual(last[a.playerId].pts, a.pts);
    assert.strictEqual(last[a.playerId].total, a.total);
  }
  assert.strictEqual(steps[1].standings[0].rank, 1);
});

test('week runs Monday to Sunday', () => {
  const r = C.periodRange('week', 0, new Date(2026, 10, 8)); // Sun 8 Nov 2026
  assert.strictEqual(r.start, '2026-11-02');
  assert.strictEqual(r.end, '2026-11-09');
  assert.ok(C.inRange('2026-11-08', r));
  assert.ok(!C.inRange('2026-11-09', r));
});

console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`);
