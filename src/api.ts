import type { WheelState } from './game';

export const API_ROOT = 'https://api.squeekchain.com/v1';
export const API_DOCS = 'https://docs.squeekchain.com/developers/api/';
export const POLL_MS = 5000;
export const DEMO_SEED = 'squeek-maze-sprint:v1:offline-demo';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The official API returned an unsupported response.');
  return value as Json;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.length) throw new Error('The official API response is missing required data.');
  return value;
}
function uint(value: unknown) {
  const result = text(value);
  if (!/^\d+$/.test(result)) throw new Error('The official API returned an invalid chain value.');
  return result;
}
function hash(value: unknown) {
  const result = text(value).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(result) || /^0x0+$/.test(result)) throw new Error('The official settlement hash is unavailable.');
  return result;
}
function timestamp(value: unknown) {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error('The observation timestamp is invalid.');
  return result;
}
function supported(data: Json, version: number) {
  if (data.schemaVersion !== version) throw new Error('This version of the official API is not supported yet.');
  if (data.status === 'unavailable') throw new Error('The official API reports that its data is unavailable.');
}

export type WheelObservation = {
  state: WheelState;
  observedAt: string | null;
  receivedAt: string | null;
  checkedAt: number;
  staleAfterMs: number;
  rpm: number | null;
  provenance: string;
  reason: string | null;
};

export function unavailableWheel(reason: string, now = Date.now(), previous?: WheelObservation): WheelObservation {
  return {
    state: 'unknown', observedAt: previous?.observedAt ?? null, receivedAt: previous?.receivedAt ?? null,
    checkedAt: now, staleAfterMs: previous?.staleAfterMs ?? 120000,
    rpm: null, provenance: previous?.provenance ?? 'unavailable', reason,
  };
}

export function parseWheel(value: unknown, now = Date.now()): WheelObservation {
  const data = object(value);
  supported(data, 1);
  if (data.measurement === null) return unavailableWheel('No wheel observation is available yet.', now);
  const measurement = object(data.measurement);
  const observedAt = timestamp(measurement.observedAt);
  const receivedAt = timestamp(measurement.receivedAt);
  const staleSeconds = measurement.staleAfterSeconds;
  if (typeof staleSeconds !== 'number' || !Number.isFinite(staleSeconds) || staleSeconds <= 0) throw new Error('The API freshness threshold is invalid.');
  const provenance = text(measurement.provenance);
  const rpm = measurement.rpmMilli;
  const base: WheelObservation = { state: 'unknown', observedAt, receivedAt, checkedAt: now, staleAfterMs: Math.min(staleSeconds, 120) * 1000, rpm: null, provenance, reason: null };
  if (provenance !== 'hardware') return { ...base, reason: `The API labels this observation ${provenance}; live bonuses are disabled.` };
  if (measurement.freshness !== 'online' || now - Date.parse(receivedAt) > base.staleAfterMs || now - Date.parse(observedAt) > base.staleAfterMs || Date.parse(observedAt) > now + 30000) {
    return { ...base, reason: 'The official wheel observation is stale. Speeds are neutral.' };
  }
  if (!['IDLE', 'ACTIVE'].includes(String(measurement.coreStatus)) || typeof rpm !== 'number' || !Number.isSafeInteger(rpm) || rpm < 0) return { ...base, reason: 'The wheel sensor is not reporting a healthy reading.' };
  return { ...base, rpm: rpm / 1000, state: rpm > 0 ? 'running' : 'resting' };
}

export function effectiveWheel(observation: WheelObservation | null, now = Date.now()): WheelState {
  if (!observation || observation.state === 'unknown' || !observation.receivedAt || !observation.observedAt) return 'unknown';
  if (now - observation.checkedAt > 15000 || now - Date.parse(observation.receivedAt) > observation.staleAfterMs || now - Date.parse(observation.observedAt) > observation.staleAfterMs) return 'unknown';
  return observation.state;
}

export type BoardIdentity = {
  mode: 'live' | 'demo';
  seed: string;
  round: string | null;
  height: string | null;
  anchorHeight: string | null;
  hash: string | null;
  latestHash: string | null;
  anchorAt: string | null;
  roundStart: string | null;
  roundEnd: string | null;
  chain: string | null;
  installation: string | null;
  fetchedAt: number;
  reason: string | null;
};
export type Snapshot = { board: BoardIdentity; wheel: WheelObservation };

export function demoBoard(reason: string, now = Date.now()): BoardIdentity {
  return { mode: 'demo', seed: DEMO_SEED, round: null, height: null, anchorHeight: null, hash: null, latestHash: null, anchorAt: null, roundStart: null, roundEnd: null, chain: null, installation: null, fetchedAt: now, reason };
}

// The API exposes settlement hashes, not an independent hash per Squeek block.
// Pin the newest BatchSettled before the round boundary, so later settlements
// cannot change this round's maze. Never substitute an Ethereum safe-tip hash.
export function parseBoard(coreValue: unknown, economyValue: unknown, now = Date.now()): BoardIdentity {
  const core = object(coreValue), economy = object(economyValue);
  supported(core, 1); supported(economy, 2);
  if (core.status !== 'available' || economy.status !== 'available') throw new Error('The official chain data is unavailable.');
  const installation = text(core.installationId);
  if (installation !== text(economy.installationId)) throw new Error('The official API responses refer to different installations.');
  const coreChain = object(core.chain), economyChain = object(economy.chain);
  if (text(coreChain.chainId) !== text(economyChain.chainId)) throw new Error('The official API responses refer to different networks.');
  const safeAt = Date.parse(timestamp(economyChain.safeBlockTimestamp));
  if (now - safeAt > 10 * 60000 || safeAt > now + 30000) throw new Error('The official chain snapshot is too old to start a live run.');
  const round = uint(object(economy.lifecycle).currentRound);
  if (BigInt(round) < 1n) throw new Error('Squeekchain rounds have not started yet.');
  const config = object(core.configuration);
  const duration = BigInt(uint(config.roundDuration));
  if (duration <= 0n) throw new Error('The round duration is invalid.');
  const start = BigInt(uint(config.genesisTimestamp)) + (BigInt(round) - 1n) * duration;
  const end = start + duration;
  if (safeAt / 1000 < Number(start) || safeAt / 1000 >= Number(end)) throw new Error('The official round and safe-block timestamp disagree.');
  const state = object(core.core);
  const height = uint(state.blockHeight);
  const source = object(core.source);
  const latestHash = hash(source.blockHash);
  if (!Array.isArray(core.events)) throw new Error('Settlement history is unavailable.');
  const events = core.events.map(object).filter(e => e.eventName === 'BatchSettled' && BigInt(uint(e.blockTimestamp)) <= start)
    .sort((a, b) => Number(BigInt(uint(b.blockTimestamp)) - BigInt(uint(a.blockTimestamp))) || Number(BigInt(uint(b.logIndex)) - BigInt(uint(a.logIndex))));
  const anchor = events[0];
  if (!anchor) throw new Error('The API has no settlement anchor for this round.');
  const anchorHash = hash(anchor.blockHash);
  const args = Array.isArray(anchor.arguments) ? anchor.arguments.map(object) : [];
  const units = args.find(a => a.name === 'cumulativeBlockUnits');
  const anchorHeight = units ? (BigInt(uint(units.value)) / BigInt(uint(config.blockUnitsPerBlock))).toString() : null;
  const chain = text(economyChain.target);
  return {
    mode: 'live', seed: `squeek-maze-sprint:v1:${installation}:${round}:${anchorHash}`,
    round, height, anchorHeight, hash: anchorHash, latestHash, chain, installation,
    anchorAt: new Date(Number(BigInt(uint(anchor.blockTimestamp))) * 1000).toISOString(),
    roundStart: new Date(Number(start) * 1000).toISOString(), roundEnd: new Date(Number(end) * 1000).toISOString(),
    fetchedAt: now, reason: null,
  };
}

export class SqueekApi {
  private nextAllowedAt = 0;
  constructor(private fetcher: typeof fetch = fetch, private now: () => number = Date.now) {}

  private async read(endpoint: string): Promise<unknown> {
    if (this.now() < this.nextAllowedAt) throw new Error('The official API requested a retry delay. Retrying automatically.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      // Invoke the native browser function without binding it to this client.
      const fetcher = this.fetcher;
      const response = await fetcher(`${API_ROOT}/${endpoint}`, { signal: controller.signal, cache: 'no-cache', credentials: 'omit', headers: { Accept: 'application/json' } });
      if (!response.ok) {
        if (response.status === 429 || response.status === 503) {
          const retry = response.headers.get('Retry-After');
          const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Math.max(5000, Date.parse(retry) - this.now()) : 15000;
          this.nextAllowedAt = this.now() + (Number.isFinite(delay) ? Math.min(Math.max(delay, 5000), 3600000) : 15000);
        }
        throw new Error(`Official API unavailable (HTTP ${response.status}).`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error('The official API did not respond within 6 seconds.');
      if (error instanceof TypeError) throw new Error('Unable to reach the official API. Check your connection.');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  async wheel() { return parseWheel(await this.read('status'), this.now()); }

  async snapshot(): Promise<Snapshot> {
    try {
      const [status, core, economy] = await Promise.all([this.read('status'), this.read('core'), this.read('economy/state')]);
      const now = this.now();
      if (text(object(status).installationId) !== text(object(core).installationId)) throw new Error('Wheel and chain data refer to different installations.');
      const board = parseBoard(core, economy, now);
      return { board, wheel: parseWheel(status, now) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The official API is unavailable.';
      return { board: demoBoard(reason, this.now()), wheel: unavailableWheel(reason, this.now()) };
    }
  }
}
