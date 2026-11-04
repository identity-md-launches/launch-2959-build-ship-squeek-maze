import { SqueekApi } from '../src/api';

const snapshot = await new SqueekApi().snapshot();
console.log(JSON.stringify({
  check: 'Official public API, actual network responses; not test fixtures',
  checkedAt: new Date().toISOString(),
  mode: snapshot.board.mode,
  round: snapshot.board.round,
  height: snapshot.board.height,
  chain: snapshot.board.chain,
  latestSettlementHash: snapshot.board.latestHash,
  roundAnchorHash: snapshot.board.hash,
  roundStart: snapshot.board.roundStart,
  wheelState: snapshot.wheel.state,
  observedAt: snapshot.wheel.observedAt,
  provenance: snapshot.wheel.provenance,
  limitation: snapshot.board.reason ?? snapshot.wheel.reason,
}, null, 2));
if (snapshot.board.mode !== 'live') process.exitCode = 1;
