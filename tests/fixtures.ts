// Minimal, frozen extracts of real official public responses fetched 4 Nov 2026.
// Tests use this observation time, never label this fixture as current live data.
export const FIXTURE_NOW = Date.parse('2026-11-04T07:59:10.460Z');
export const INSTALLATION = 'stream-game-sepolia-test-20261025-01';
export const LATEST_HASH = '0xa7d621ebb631a29610b302ccadf862b4da6f6e8bff5a621fe4f0384a3533c3ff';
export const ANCHOR_HASH = '0xe2ed146d5a00b77d60cafde7182b2335af80d13c014eb45139d6b8b5cb15aa54';
export const statusFixture = {
  schemaVersion: 1, installationId: INSTALLATION,
  generatedAt: '2026-11-04T07:59:08.882Z',
  measurement: {
    freshness: 'online', observedAt: '2026-11-04T07:58:58.685Z', receivedAt: '2026-11-04T07:58:59.227Z',
    staleAfterSeconds: 120, provenance: 'hardware', coreStatus: 'IDLE', rpmMilli: 0, speedMmPerSecond: 0,
  },
};
export const coreFixture = {
  schemaVersion: 1, installationId: INSTALLATION, status: 'available',
  chain: { target: 'sepolia', chainId: '11155111', safeThroughBlock: '12061070' },
  configuration: { genesisTimestamp: '1793022600', roundDuration: '600', blockUnitsPerBlock: '1000000000' },
  core: { blockHeight: '8430', settledThroughRound: '1260' },
  source: { eventName: 'BatchSettled', blockHash: LATEST_HASH },
  events: [
    { eventName: 'BatchSettled', blockTimestamp: '1793778636', blockHash: LATEST_HASH, logIndex: '117', arguments: [{ name: 'cumulativeBlockUnits', value: '8430478838171' }] },
    { eventName: 'BatchSettled', blockTimestamp: '1793778036', blockHash: ANCHOR_HASH, logIndex: '117', arguments: [{ name: 'cumulativeBlockUnits', value: '8430478838171' }] },
  ],
};
export const economyFixture = {
  schemaVersion: 2, installationId: INSTALLATION, status: 'available', generatedAt: '2026-11-04T07:59:10.460Z',
  chain: { target: 'sepolia', chainId: '11155111', safeThroughBlock: '12061070', safeBlockTimestamp: '2026-11-04T07:56:48.000Z' },
  lifecycle: { currentRound: '1261', stage: 'active' },
};
