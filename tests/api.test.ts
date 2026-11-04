import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_HASH, coreFixture, economyFixture, FIXTURE_NOW, statusFixture } from './fixtures';
import { DEMO_SEED, effectiveWheel, parseBoard, parseWheel, SqueekApi, unavailableWheel } from '../src/api';

test('real official fixtures resolve round, current height, latest hash and canonical round anchor', () => {
  const board = parseBoard(coreFixture, economyFixture, FIXTURE_NOW);
  assert.equal(board.mode, 'live'); assert.equal(board.round, '1261'); assert.equal(board.height, '8430');
  assert.equal(board.hash, ANCHOR_HASH); assert.equal(board.roundStart, '2026-11-04T07:50:00.000Z');
  assert.notEqual(board.hash, board.latestHash);
});
test('a settlement arriving during the same round leaves the maze seed unchanged', () => {
  const before = parseBoard(coreFixture, economyFixture, FIXTURE_NOW);
  const next = structuredClone(coreFixture);
  next.events.unshift({ ...next.events[0], blockTimestamp: String(FIXTURE_NOW / 1000 | 0), blockHash: before.hash! });
  assert.equal(parseBoard(next, economyFixture, FIXTURE_NOW).seed, before.seed);
});
test('round changes alter the seed while unsupported schemas, missing hashes, stale snapshots and mismatched installations reject', () => {
  const next = structuredClone(economyFixture); next.lifecycle.currentRound = '1262'; next.chain.safeBlockTimestamp = '2026-11-04T08:01:00.000Z';
  assert.notEqual(parseBoard(coreFixture, next, FIXTURE_NOW + 180000).seed, parseBoard(coreFixture, economyFixture, FIXTURE_NOW).seed);
  assert.throws(() => parseBoard({ ...coreFixture, schemaVersion: 99 }, economyFixture, FIXTURE_NOW));
  assert.throws(() => parseBoard({ ...coreFixture, source: { blockHash: null } }, economyFixture, FIXTURE_NOW));
  assert.throws(() => parseBoard(coreFixture, economyFixture, FIXTURE_NOW + 1000000));
  assert.throws(() => parseBoard(coreFixture, { ...economyFixture, installationId: 'mismatched-test-installation' }, FIXTURE_NOW));
});
test('fresh hardware RPM determines resting or running; stale, simulated, replayed and faulted sensors grant no bonus', () => {
  assert.equal(parseWheel(statusFixture, FIXTURE_NOW).state, 'resting');
  assert.equal(parseWheel({ ...statusFixture, measurement: { ...statusFixture.measurement, rpmMilli: 20000 } }, FIXTURE_NOW).state, 'running');
  for (const change of [{ freshness: 'stale' }, { provenance: 'simulated' }, { provenance: 'replay' }, { coreStatus: 'COUNTER_FAULT' }, { rpmMilli: -1 }]) {
    assert.equal(parseWheel({ ...statusFixture, measurement: { ...statusFixture.measurement, ...change } }, FIXTURE_NOW).state, 'unknown');
  }
  assert.equal(parseWheel(statusFixture, FIXTURE_NOW + 121000).state, 'unknown');
  assert.equal(parseWheel({ ...statusFixture, measurement: null }, FIXTURE_NOW).state, 'unknown');
});
test('loss of polling expires a previously live modifier; failed requests preserve only the last observation timestamp', () => {
  const observed = parseWheel(statusFixture, FIXTURE_NOW);
  assert.equal(effectiveWheel(observed, FIXTURE_NOW + 1000), 'resting');
  assert.equal(effectiveWheel(observed, FIXTURE_NOW + 16000), 'unknown');
  const lost = unavailableWheel('Network unavailable', FIXTURE_NOW, observed);
  assert.equal(effectiveWheel(lost, FIXTURE_NOW), 'unknown'); assert.equal(lost.observedAt, observed.observedAt);
});
function fetcherFor(mode: 'live' | 'network' | 'http' | 'bad-json' | 'semantic' | 'rate-limit') {
  let calls = 0;
  const fetcher = (async (input: string | URL | Request) => {
    calls++;
    if (mode === 'network') throw new TypeError('Failed to fetch');
    if (mode === 'http') return new Response('Unavailable', {status:503});
    if (mode === 'rate-limit') return new Response('{}', {status:429, headers:{'Retry-After':'30'}});
    if (mode === 'bad-json') return new Response('not JSON');
    const url = String(input);
    const data = mode === 'semantic' ? { schemaVersion: 1, status: 'unavailable' } : url.endsWith('/status') ? statusFixture : url.endsWith('/core') ? coreFixture : economyFixture;
    return new Response(JSON.stringify(data), { headers:{'Content-Type':'application/json'} });
  }) as typeof fetch;
  return { fetcher, calls: () => calls };
}
test('working official responses stay live; failure alone enables a clearly separate deterministic demo', async () => {
  const live = await new SqueekApi(fetcherFor('live').fetcher, () => FIXTURE_NOW).snapshot(); assert.equal(live.board.mode, 'live');
  for (const mode of ['network','http','bad-json','semantic'] as const) {
    const snapshot = await new SqueekApi(fetcherFor(mode).fetcher, () => FIXTURE_NOW).snapshot();
    assert.equal(snapshot.board.mode, 'demo'); assert.equal(snapshot.board.seed, DEMO_SEED);
    assert.equal(snapshot.board.round, null); assert.equal(snapshot.board.hash, null); assert.equal(snapshot.wheel.state, 'unknown'); assert.ok(snapshot.board.reason);
  }
});
test('Retry-After prevents hammering the official API', async () => {
  const source = fetcherFor('rate-limit'); let time = FIXTURE_NOW;
  const api = new SqueekApi(source.fetcher, () => time);
  await api.snapshot(); const calls = source.calls();
  await api.snapshot(); assert.equal(source.calls(), calls);
  time += 31000; await api.snapshot(); assert.ok(source.calls() > calls);
});

test('a request that never resolves times out into a demo instead of leaving Start disabled', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const hangs = ((_url: unknown, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
  })) as typeof fetch;
  const pending = new SqueekApi(hangs, () => FIXTURE_NOW).snapshot();
  context.mock.timers.tick(6000);
  const snapshot = await pending;
  assert.equal(snapshot.board.mode, 'demo'); assert.match(snapshot.board.reason!, /6 seconds/);
});
