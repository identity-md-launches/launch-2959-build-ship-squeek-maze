import type { BoardIdentity } from './api';

const STORAGE_KEY = 'squeek-maze-sprint:best:v1';
export type Best = { round: string | null; mode: 'live' | 'demo'; score: number; seed: string; savedAt: string };
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readBests(storage: StorageLike | null): Best[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is Best => !!v && typeof v === 'object' && ['live', 'demo'].includes(v.mode) && (v.round === null || typeof v.round === 'string') && Number.isSafeInteger(v.score) && v.score >= 0 && typeof v.seed === 'string' && typeof v.savedAt === 'string').slice(0, 100);
  } catch { return []; }
}

export function bestFor(bests: Best[], board: BoardIdentity) {
  return bests.find(b => b.mode === board.mode && b.round === board.round && (board.mode === 'demo' || b.seed.includes(board.installation ?? ''))) ?? null;
}

export function saveBest(storage: StorageLike | null, board: BoardIdentity, score: number, now = new Date()): { bests: Best[]; saved: boolean; isNew: boolean } {
  const bests = readBests(storage);
  const prior = bestFor(bests, board);
  if (prior && prior.score >= score) return { bests, saved: storage !== null, isNew: false };
  const next: Best = { mode: board.mode, round: board.round, score, seed: board.seed, savedAt: now.toISOString() };
  const updated = [next, ...bests.filter(b => b !== prior)].slice(0, 100);
  try {
    if (!storage) throw new Error('Storage is unavailable.');
    storage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return { bests: updated, saved: true, isNew: true };
  } catch { return { bests: updated, saved: false, isNew: true }; }
}

export function browserStorage(): StorageLike | null {
  try { return window.localStorage; } catch { return null; }
}
