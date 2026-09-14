import test from 'node:test';
import assert from 'node:assert/strict';
import { PersistentWorld } from '../src/domain/persistent-world.ts';

const EPOCH = 1_700_000_000_000;

function world(now) {
  return new PersistentWorld(now === undefined ? {epochMs: EPOCH} : {epochMs: EPOCH, now});
}

test('rejects invalid epochMs in constructor', () => {
  assert.throws(() => new PersistentWorld({epochMs: Number.NaN}), TypeError);
  assert.throws(() => new PersistentWorld({epochMs: 'x'}), TypeError);
  assert.throws(() => new PersistentWorld(undefined), TypeError);
});

test('admits exactly six players then rejects the seventh', () => {
  const w = world();
  const ids = [];
  for (let i = 0; i < 6; i++) {
    const id = `player0${i}`;
    const p = w.admit(id, ` Name ${i} `);
    assert.ok(p, `admit ${id}`);
    assert.equal(p.slot, i);
    assert.equal(p.name, `Name ${i}`);
    assert.equal(p.seq, 0);
    assert.equal(p.speed, 0);
    assert.equal(p.running, false);
    assert.equal(p.heading, 0);
    ids.push(id);
  }
  assert.equal(w.players.size, 6);
  assert.equal(w.admit('player06', 'overflow'), null);
  assert.equal(w.players.size, 6);
  // slot-derived spawn positions
  assert.equal(w.players.get('player00').x, 0.5 + (0 % 3 - 1) * 0.003);
  assert.equal(w.players.get('player00').y, 0.4);
  assert.equal(w.players.get('player03').y, 0.4 + 1 * 0.003);
  assert.equal(w.players.get('player04').x, 0.5 + (4 % 3 - 1) * 0.003);
  // invalid ids never admit
  assert.equal(w.admit('short', 'x'), null);
  assert.equal(w.admit('bad id!!', 'x'), null);
});

test('depart releases the slot for the next admit', () => {
  const w = world();
  for (let i = 0; i < 6; i++) w.admit(`player0${i}`, `p${i}`);
  assert.ok(w.players.has('player02'));
  w.depart('player02');
  assert.equal(w.players.has('player02'), false);
  const p = w.admit('player09', 'new');
  assert.ok(p);
  assert.equal(p.slot, 2);
  assert.equal(w.players.size, 6);
  w.depart('missing-id');
});

test('same-id reconnect preserves slot and position, resets seq and rate', () => {
  let t = 1000;
  const w = world(() => t);
  const first = w.admit('player01', 'Old');
  assert.equal(w.move('player01', {x: 0.2, y: 0.3, seq: 1, heading: 5, speed: 2, running: true}), true);
  assert.equal(first.x, 0.2);
  t += 1000;

  const re = w.admit('player01', ' New Name ');
  assert.equal(re.slot, first.slot);
  assert.equal(re.x, 0.2);
  assert.equal(re.y, 0.3);
  assert.equal(re.name, 'New Name');
  assert.equal(re.seq, 0);
  // rate bookkeeping reset: first move after reconnect is accepted immediately
  assert.equal(w.move('player01', {x: 0.4, y: 0.5, seq: 1}), true);
  assert.equal(w.players.size, 1);
});

test('move rejects invalid, out-of-order and rate-limited input', () => {
  let t = 0;
  const w = world(() => t);
  w.admit('player01', 'p');
  assert.equal(w.move('player01', null), false);
  assert.equal(w.move('player01', {x: 2, y: 0, seq: 1}), false);
  assert.equal(w.move('player01', {x: 0.5, y: 0.5, seq: -1}), false);
  assert.equal(w.move('player01', {x: 0.5, y: 0.5, seq: 1.5}), false);
  assert.equal(w.move('unknown-id', {x: 0.5, y: 0.5, seq: 1}), false);

  assert.equal(w.move('player01', {x: 0.5, y: 0.5, seq: 1}), true);
  // strictly greater seq required
  assert.equal(w.move('player01', {x: 0.6, y: 0.5, seq: 1}), false);
  // same seq rejected even after time passes
  t += 100;
  assert.equal(w.move('player01', {x: 0.6, y: 0.5, seq: 1}), false);
  // rate limit: < 30ms since last accepted move
  t = 10;
  assert.equal(w.move('player01', {x: 0.6, y: 0.5, seq: 2}), false);
  t += 20; // exactly 30ms since last accepted
  assert.equal(w.move('player01', {x: 0.6, y: 0.5, seq: 2}), true);
  assert.equal(w.players.get('player01').seq, 2);
});

test('move never accepts injected identity fields and copies defensively', () => {
  const w = world();
  const p = w.admit('player01', 'p');
  const injected = {x: 0.1, y: 0.2, seq: 1, id: 'hacker00', name: 'Hacked', slot: 5};
  assert.equal(w.move('player01', injected), true);
  assert.equal(p.id, 'player01');
  assert.equal(p.name, 'p');
  assert.equal(p.slot, 0);
  injected.x = 0.9;
  assert.equal(p.x, 0.1);
});

test('snapshot increments tick and returns deep copies', () => {
  let t = 5000;
  const w = world(() => t);
  w.admit('player01', 'p');
  const a = w.snapshot();
  assert.equal(a.tick, 1);
  assert.equal(a.clock.epochMs, EPOCH);
  assert.equal(a.clock.serverMs, 5000);
  assert.equal(a.clock.cycleSeconds, 1200);
  a.players[0].x = 0.99;
  a.players.push({id: 'player02', name: 'q', slot: 1, x: 0, y: 0, seq: 0});
  const b = w.snapshot();
  assert.equal(b.tick, 2);
  assert.equal(b.players.length, 1);
  assert.equal(b.players[0].x, 0.5 + (0 % 3 - 1) * 0.003);
});

test('fixed epoch time is reported while world is empty', () => {
  const w = world(() => 42);
  const snap = w.snapshot();
  assert.deepEqual(snap.players, []);
  assert.equal(snap.tick, 1);
  assert.equal(snap.clock.serverMs, 42);
  assert.equal(snap.clock.epochMs, EPOCH);
  assert.equal(snap.clock.cycleSeconds, 1200);
});
