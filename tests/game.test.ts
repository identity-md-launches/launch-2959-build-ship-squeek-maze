import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advance, createGame, hazardAt, RUN_MS, scoreFor, speedsFor } from '../src/game';
import { generateMaze, type Maze } from '../src/maze';

function corridor(): Maze {
  return { seed: 'test-only-corridor', cells: [[false,false,false,false,false],[false,true,true,true,false],[false,false,false,false,false]], spawn: { x: 1, y: 1 }, squeeks: [{ x: 2, y: 1 }, { x: 3, y: 1 }], hazardPaths: [] };
}
test('scoring awards 10 per Squeek, 100 per sweep, and clips each bump at zero without a future debt', () => {
  assert.equal(scoreFor(0, 'squeek'), 10); assert.equal(scoreFor(40, 'bump'), 15);
  assert.equal(scoreFor(10, 'bump'), 0); assert.equal(scoreFor(scoreFor(10, 'bump'), 'squeek'), 10);
  assert.equal(scoreFor(20, 'sweep'), 120);
});
test('movement collects only once, respects walls, and refills only after a full sweep', () => {
  const game = createGame(corridor());
  advance(game, 10, 'up', 'unknown'); assert.deepEqual(game.player, { x: 1, y: 1 });
  advance(game, 140, 'right', 'unknown'); assert.equal(game.score, 10); assert.equal(game.collected, 1);
  advance(game, 140, 'right', 'unknown'); assert.equal(game.score, 120); assert.equal(game.sweeps, 1);
  advance(game, 300, 'right', 'unknown'); assert.equal(game.player.x, 3); assert.equal(game.collected, 2);
});
test('hazard collisions apply one penalty during the shield period, including when player stands still', () => {
  const maze = corridor(); maze.hazardPaths = [[{ x: 2, y: 1 }, { x: 1, y: 1 }]];
  const game = createGame(maze); game.score = 100;
  advance(game, 450, null, 'unknown'); assert.equal(game.hits, 1); assert.equal(game.score, 75);
  advance(game, 1000, null, 'unknown'); assert.equal(game.hits, 1);
  advance(game, 2000, null, 'unknown'); assert.ok(game.hits > 1);
});
test('a run ends at exactly 60 seconds and cannot score after the deadline', () => {
  const game = createGame(generateMaze('deadline'));
  advance(game, 59999, null, 'unknown'); assert.equal(game.done, false);
  advance(game, 100, null, 'unknown'); assert.equal(game.done, true); assert.equal(game.elapsed, RUN_MS);
  const snapshot = structuredClone(game); advance(game, 1000, 'right', 'running'); assert.deepEqual(game, snapshot);
});
test('wheel state changes actual movement and hazard timing', () => {
  const base = speedsFor('unknown'), running = speedsFor('running'), resting = speedsFor('resting');
  assert.equal(base.player / running.player, 1.1); assert.equal(resting.hazard / base.hazard, 1.35);
  assert.equal(resting.player, base.player); assert.equal(running.hazard, base.hazard);
  const normal = createGame(corridor()), fast = createGame(corridor());
  advance(normal, 135, 'right', 'unknown'); advance(fast, 135, 'right', 'running');
  assert.ok(fast.player.x > normal.player.x);
  const calm = createGame(corridor()), hazardNormal = createGame(corridor());
  advance(calm, 500, null, 'resting'); advance(hazardNormal, 500, null, 'unknown');
  assert.equal(calm.hazardStep, 0); assert.equal(hazardNormal.hazardStep, 1);
});
test('patrols bounce continuously without jumping through walls', () => {
  const path = [{x:0,y:0},{x:1,y:0},{x:2,y:0}];
  assert.deepEqual(Array.from({length:7},(_,i)=>hazardAt(path,i).x), [0,1,2,1,0,1,2]);
});

test('movement preserves fractional cooldowns so a 10% bonus is not lost to frame rounding', () => {
  const maze: Maze = { seed: 'test-only-long-corridor', cells: [Array(200).fill(false), Array.from({length:200},(_,x)=>x>0&&x<199), Array(200).fill(false)], spawn:{x:1,y:1}, squeeks:[{x:198,y:1}], hazardPaths:[] };
  for (const wheel of ['unknown','running'] as const) {
    const oneFrame = createGame(maze), tinyFrames = createGame(maze);
    advance(oneFrame, 10000, 'right', wheel);
    for(let i=0;i<10000;i++) advance(tinyFrames, 1, 'right', wheel);
    assert.equal(oneFrame.player.x, tinyFrames.player.x);
    assert.ok(Math.abs((oneFrame.player.x - 1) - (1 + Math.floor(10000 / speedsFor(wheel).player))) <= 1);
  }
});
