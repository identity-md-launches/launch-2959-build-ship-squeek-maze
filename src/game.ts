import { isOpen, key, same, VECTORS, type Direction, type Maze, type Point } from './maze';

export const RUN_MS = 60_000;
export const SQUEEK_POINTS = 10;
export const HIT_PENALTY = 25;
export const SWEEP_BONUS = 100;
export const PLAYER_STEP_MS = 140;
export const HAZARD_STEP_MS = 440;
export type WheelState = 'running' | 'resting' | 'unknown';
export type GameState = {
  maze: Maze;
  player: Point;
  facing: Direction;
  remaining: Set<string>;
  collected: number;
  sweeps: number;
  hits: number;
  score: number;
  elapsed: number;
  moveClock: number;
  hazardClock: number;
  hazardStep: number;
  shieldUntil: number;
  done: boolean;
};

export function scoreFor(score: number, event: 'squeek' | 'bump' | 'sweep') {
  const change = { squeek: SQUEEK_POINTS, bump: -HIT_PENALTY, sweep: SWEEP_BONUS }[event];
  return Math.max(0, score + change);
}

export function createGame(maze: Maze): GameState {
  return {
    maze, player: { ...maze.spawn }, facing: 'right', remaining: new Set(maze.squeeks.map(key)),
    collected: 0, sweeps: 0, hits: 0, score: 0, elapsed: 0, moveClock: PLAYER_STEP_MS,
    hazardClock: 0, hazardStep: 0, shieldUntil: 0, done: false,
  };
}

export function hazardAt(path: Point[], step: number): Point {
  if (path.length < 2) return path[0];
  const period = (path.length - 1) * 2;
  const p = step % period;
  return path[p < path.length ? p : period - p];
}

export function speedsFor(wheel: WheelState) {
  return { player: PLAYER_STEP_MS / (wheel === 'running' ? 1.1 : 1), hazard: HAZARD_STEP_MS * (wheel === 'resting' ? 1.35 : 1) };
}

function collision(game: GameState) {
  if (game.elapsed < game.shieldUntil) return;
  if (game.maze.hazardPaths.some(path => same(game.player, hazardAt(path, game.hazardStep)))) {
    game.hits++;
    game.score = scoreFor(game.score, 'bump');
    game.shieldUntil = game.elapsed + 1800;
  }
}

function move(game: GameState, direction: Direction) {
  const vector = VECTORS[direction];
  const next = { x: game.player.x + vector.x, y: game.player.y + vector.y };
  game.facing = direction;
  if (isOpen(game.maze, next)) game.player = next;
  if (game.remaining.delete(key(game.player))) { game.collected++; game.score = scoreFor(game.score, 'squeek'); }
  if (!game.remaining.size) {
    game.sweeps++;
    game.score = scoreFor(game.score, 'sweep');
    game.remaining = new Set(game.maze.squeeks.map(key));
    game.remaining.delete(key(game.player));
  }
  collision(game);
}

// Small fixed simulation slices make collisions independent of rendering frame rate.
// A real elapsed delta still expires a run after background throttling.
export function advance(game: GameState, deltaMs: number, direction: Direction | null, wheel: WheelState) {
  if (game.done || !Number.isFinite(deltaMs) || deltaMs < 0) return game;
  const target = Math.min(RUN_MS, game.elapsed + deltaMs);
  const speeds = speedsFor(wheel);
  game.moveClock = Math.min(game.moveClock, speeds.player);
  while (game.elapsed < target) {
    const dt = Math.min(10, target - game.elapsed);
    game.elapsed += dt;
    game.moveClock = direction ? game.moveClock + dt : Math.min(game.moveClock + dt, speeds.player);
    game.hazardClock += dt;
    if (direction && game.moveClock >= speeds.player) { move(game, direction); game.moveClock -= speeds.player; }
    if (game.hazardClock >= speeds.hazard) { game.hazardStep++; game.hazardClock -= speeds.hazard; collision(game); }
  }
  game.done = game.elapsed >= RUN_MS;
  return game;
}
