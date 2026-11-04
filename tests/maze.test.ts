import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateMaze, isOpen, key, VECTORS, SIZE, distance } from '../src/maze';

test('same seed gives identical walls, collectibles and hazard paths', () => {
  assert.deepEqual(generateMaze('round-seed'), generateMaze('round-seed'));
  assert.notDeepEqual(generateMaze('round-a').cells, generateMaze('round-b').cells);
});

test('50 boards have closed boundaries, unique reachable collectibles and legal hazard patrols', () => {
  for (let n = 0; n < 50; n++) {
    const maze = generateMaze(`invariant-test-${n}`);
    const reached = new Set([key(maze.spawn)]), queue = [maze.spawn];
    for (let i = 0; i < queue.length; i++) for (const v of Object.values(VECTORS)) {
      const next = { x: queue[i].x + v.x, y: queue[i].y + v.y };
      if (isOpen(maze, next) && !reached.has(key(next))) { reached.add(key(next)); queue.push(next); }
    }
    assert.equal(maze.cells.flat().filter(Boolean).length, reached.size);
    assert.equal(maze.squeeks.length, 72);
    assert.equal(new Set(maze.squeeks.map(key)).size, 72);
    maze.squeeks.forEach(p => assert.ok(reached.has(key(p))));
    assert.equal(maze.hazardPaths.length, 4);
    maze.hazardPaths.forEach(path => {
      assert.ok(distance(path[0], maze.spawn) >= 10);
      path.forEach((p, i) => { assert.ok(reached.has(key(p))); assert.ok(distance(p, maze.spawn) > 3); if (i) assert.equal(distance(p, path[i - 1]), 1); });
    });
    for (let i = 0; i < SIZE; i++) assert.ok(!maze.cells[0][i] && !maze.cells[SIZE - 1][i] && !maze.cells[i][0] && !maze.cells[i][SIZE - 1]);
  }
});
