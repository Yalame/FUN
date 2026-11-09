// Run with:  node tests/sync.test.js
const assert = require('assert');
const Y = require('../sync.js');

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
const base = () => ({ players: [], nights: [], deleted: Y.emptyDeleted(), settings: { tableFee: 5, theme: 'felt', sound: true }, settingsUpdatedAt: 0 });
const round = (id, at) => ({ id, at, points: 1, results: [] });

console.log('Merging two phones');

test('players added on different phones are both kept', () => {
  const a = { ...base(), players: [{ id: 'p1', name: 'Reza', updatedAt: 1 }] };
  const b = { ...base(), players: [{ id: 'p2', name: 'Sara', updatedAt: 2 }] };
  const m = Y.mergeData(a, b);
  assert.deepStrictEqual(m.players.map((p) => p.name).sort(), ['Reza', 'Sara']);
});

test('the newer rename wins', () => {
  const a = { ...base(), players: [{ id: 'p1', name: 'Reza', updatedAt: 1 }] };
  const b = { ...base(), players: [{ id: 'p1', name: 'Reza K', updatedAt: 5 }] };
  assert.strictEqual(Y.mergeData(a, b).players[0].name, 'Reza K');
  assert.strictEqual(Y.mergeData(b, a).players[0].name, 'Reza K');
});

test('rounds saved on two phones in the same night are all kept, in time order', () => {
  const night = (rounds, updatedAt) => ({ id: 'n1', status: 'active', playerIds: ['p1', 'p2'], rounds, joins: [], updatedAt });
  const a = { ...base(), nights: [night([round('r1', 10), round('r3', 30)], 30)] };
  const b = { ...base(), nights: [night([round('r1', 10), round('r2', 20)], 20)] };
  const m = Y.mergeData(a, b);
  assert.deepStrictEqual(m.nights[0].rounds.map((r) => r.id), ['r1', 'r2', 'r3']);
});

test('a deleted round stays deleted', () => {
  const night = (rounds) => ({ id: 'n1', status: 'active', playerIds: [], rounds, joins: [], updatedAt: 5 });
  const a = { ...base(), nights: [night([round('r1', 10)])], deleted: { ...Y.emptyDeleted(), rounds: { r2: 40 } } };
  const b = { ...base(), nights: [night([round('r1', 10), round('r2', 20)])] };
  assert.deepStrictEqual(Y.mergeData(a, b).nights[0].rounds.map((r) => r.id), ['r1']);
  assert.deepStrictEqual(Y.mergeData(b, a).nights[0].rounds.map((r) => r.id), ['r1']);
});

test('a deleted night stays deleted, even when the other phone still has it', () => {
  const a = { ...base(), deleted: { ...Y.emptyDeleted(), nights: { n1: 100 } } };
  const b = { ...base(), nights: [{ id: 'n1', status: 'finished', playerIds: [], rounds: [], updatedAt: 50 }] };
  assert.strictEqual(Y.mergeData(b, a).nights.length, 0);
  assert.strictEqual(Y.mergeData(a, b).nights.length, 0);
});

test('finishing the night (newer) wins over the older active copy', () => {
  const a = { ...base(), nights: [{ id: 'n1', status: 'finished', bill: { invoice: 100 }, playerIds: ['p1'], rounds: [round('r1', 1)], updatedAt: 90 }] };
  const b = { ...base(), nights: [{ id: 'n1', status: 'active', playerIds: ['p1'], rounds: [round('r1', 1)], updatedAt: 40 }] };
  const m = Y.mergeData(b, a);
  assert.strictEqual(m.nights[0].status, 'finished');
  assert.strictEqual(m.nights[0].bill.invoice, 100);
});

test('late joiners from either phone are kept in the night', () => {
  const a = { ...base(), nights: [{ id: 'n1', status: 'active', playerIds: ['p1', 'p2'], rounds: [], joins: [], updatedAt: 9 }] };
  const b = { ...base(), nights: [{ id: 'n1', status: 'active', playerIds: ['p1', 'p3'], rounds: [], joins: [{ id: 'j1', playerId: 'p3', pts: 4, updatedAt: 3 }], updatedAt: 3 }] };
  const m = Y.mergeData(a, b);
  assert.deepStrictEqual(m.nights[0].playerIds, ['p1', 'p2', 'p3']);
  assert.strictEqual(m.nights[0].joins[0].pts, 4);
});

test('money rules: newer wins, but look & sound stay personal', () => {
  const a = { ...base(), settings: { tableFee: 5, theme: 'ruby', sound: false }, settingsUpdatedAt: 1 };
  const b = { ...base(), settings: { tableFee: 7, theme: 'felt', sound: true }, settingsUpdatedAt: 2 };
  const m = Y.mergeData(a, b);
  assert.strictEqual(m.settings.tableFee, 7);
  assert.strictEqual(m.settings.theme, 'ruby');
  assert.strictEqual(m.settings.sound, false);
});

test('uploaded data leaves out look & sound', () => {
  const p = Y.toPayload({ ...base(), settings: { tableFee: 5, theme: 'ruby', sound: false } });
  assert.strictEqual(p.settings.tableFee, 5);
  assert.ok(!('theme' in p.settings));
});

test('fingerprint ignores order, notices real changes', () => {
  const a = { ...base(), players: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }] };
  const b = { ...base(), players: [{ id: 'p2', name: 'B' }, { id: 'p1', name: 'A' }] };
  assert.strictEqual(Y.fingerprint(a), Y.fingerprint(b));
  const c = { ...base(), players: [{ id: 'p1', name: 'A2' }, { id: 'p2', name: 'B' }] };
  assert.notStrictEqual(Y.fingerprint(a), Y.fingerprint(c));
});

test('merging the same data twice changes nothing', () => {
  const a = { ...base(), players: [{ id: 'p1', name: 'A', updatedAt: 1 }], nights: [{ id: 'n1', status: 'active', playerIds: ['p1'], rounds: [round('r1', 1)], joins: [], updatedAt: 1 }] };
  const once = Y.mergeData(a, Y.toPayload(a));
  assert.strictEqual(Y.fingerprint(once), Y.fingerprint(a));
});

test('joining the team: same-name players are matched, not doubled', () => {
  const local = { ...base(), players: [{ id: 'x1', name: 'reza' }, { id: 'x2', name: 'Nima' }], nights: [{ id: 'n9', status: 'finished', playerIds: ['x1', 'x2'], rounds: [{ id: 'r9', at: 1, order: ['x1', 'x2'], results: [{ playerId: 'x1' }, { playerId: 'x2' }] }], joins: [] }] };
  const remote = { ...base(), players: [{ id: 'p1', name: 'Reza' }] };
  const m = Y.mergeData(Y.adoptRemoteIds(local, remote), remote);
  assert.deepStrictEqual(m.players.map((p) => p.id).sort(), ['p1', 'x2']);
  assert.deepStrictEqual(m.nights[0].playerIds, ['p1', 'x2']);
  assert.strictEqual(m.nights[0].rounds[0].results[0].playerId, 'p1');
});

test('team link is read from a gist address', () => {
  assert.deepStrictEqual(Y.parseTeamLink('https://gist.github.com/Yalame/0123456789abcdef0123'), { owner: 'Yalame', id: '0123456789abcdef0123' });
  assert.deepStrictEqual(Y.parseTeamLink('Yalame/0123456789abcdef0123'), { owner: 'Yalame', id: '0123456789abcdef0123' });
  assert.strictEqual(Y.parseTeamLink('hello'), null);
});

console.log(`\n${passed} tests passed${process.exitCode ? ' — SOME FAILED' : ''}`);
