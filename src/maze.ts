export type Point = { x: number; y: number };
export type Direction = 'up' | 'down' | 'left' | 'right';
export const VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
export const DIRECTIONS = Object.keys(VECTORS) as Direction[];
export const SIZE = 21;
export const key = (p: Point) => `${p.x},${p.y}`;
export const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// FNV-1a + Mulberry32: all arithmetic is explicitly 32-bit across browsers.
export function randomFrom(seed: string) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export type Maze = {
  seed: string;
  cells: boolean[][];
  spawn: Point;
  squeeks: Point[];
  hazardPaths: Point[][];
};

export function isOpen(maze: Maze, point: Point) {
  return maze.cells[point.y]?.[point.x] === true;
}

export function generateMaze(seed: string): Maze {
  const random = randomFrom(seed);
  const cells: boolean[][] = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  const spawn = { x: 1, y: 1 };
  const stack: Point[] = [spawn];
  cells[1][1] = true;
  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = shuffle(DIRECTIONS.slice(), random).map(d => ({
      x: current.x + VECTORS[d].x * 2, y: current.y + VECTORS[d].y * 2,
    })).filter(p => p.x > 0 && p.y > 0 && p.x < SIZE - 1 && p.y < SIZE - 1 && !cells[p.y][p.x]);
    if (!choices.length) { stack.pop(); continue; }
    const next = choices[0];
    cells[(current.y + next.y) / 2][(current.x + next.x) / 2] = true;
    cells[next.y][next.x] = true;
    stack.push(next);
  }
  // Add loops so players can dodge rather than getting trapped in long dead ends.
  const walls: Point[] = [];
  for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
    if (!cells[y][x] && ((cells[y - 1][x] && cells[y + 1][x]) || (cells[y][x - 1] && cells[y][x + 1]))) walls.push({ x, y });
  }
  shuffle(walls, random).slice(0, 23).forEach(p => { cells[p.y][p.x] = true; });
  const open: Point[] = [];
  cells.forEach((row, y) => row.forEach((passable, x) => { if (passable && distance({ x, y }, spawn) > 1) open.push({ x, y }); }));
  const squeeks = shuffle(open.slice(), random).slice(0, 72);
  // One collectible is always within easy reach of the start.
  const first = DIRECTIONS.map(d => ({ x: spawn.x + VECTORS[d].x, y: spawn.y + VECTORS[d].y })).find(p => cells[p.y]?.[p.x]);
  if (first && !squeeks.some(p => same(p, first))) squeeks[0] = first;
  const hazards = shuffle(open.filter(p => distance(p, spawn) >= 10), random).slice(0, 4);
  const hazardPaths = hazards.map(start => {
    const path = [start];
    for (let i = 0; i < 9; i++) {
      const p = path[path.length - 1];
      const choices = shuffle(DIRECTIONS.slice(), random).map(d => ({ x: p.x + VECTORS[d].x, y: p.y + VECTORS[d].y }))
        .filter(next => cells[next.y]?.[next.x] && distance(next, spawn) > 3 && (path.length < 2 || !same(next, path[path.length - 2])));
      if (!choices.length) break;
      path.push(choices[0]);
    }
    return path;
  });
  return { seed, cells, spawn, squeeks, hazardPaths };
}
