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
  assert.strictEqual(r.A.pot, 0); // played under 10 € → no pot
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

test('pot fee: under 10 → 0, exactly 10 → 5, over 10 → 10', () => {
  assert.strictEqual(C.potFee(5, S), 0);
  assert.strictEqual(C.potFee(10, S), 5);
  assert.strictEqual(C.potFee(20, S), 10);
  assert.strictEqual(C.potFee(30, S), 10);
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

test('week runs Monday to Sunday', () => {
  const r = C.periodRange('week', 0, new Date(2026, 10, 8)); // Sun 8 Nov 2026
  assert.strictEqual(r.start, '2026-11-02');
  assert.strictEqual(r.end, '2026-11-09');
  assert.ok(C.inRange('2026-11-08', r));
  assert.ok(!C.inRange('2026-11-09', r));
});

console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`);
