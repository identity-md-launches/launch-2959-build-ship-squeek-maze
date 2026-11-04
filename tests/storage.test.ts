import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoBoard, parseBoard } from '../src/api';
import { readBests, saveBest, bestFor, type StorageLike } from '../src/storage';
import { coreFixture, economyFixture, FIXTURE_NOW } from './fixtures';

function memory(): StorageLike {
  const data = new Map<string,string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key,value) => { data.set(key,value); } };
}
test('bests persist by round, keep the higher score, and separate demos', () => {
  const store = memory(), board = parseBoard(coreFixture, economyFixture, FIXTURE_NOW);
  saveBest(store,board,100); saveBest(store,board,50); saveBest(store,demoBoard('test API failure'),200);
  const bests = readBests(store);
  assert.equal(bestFor(bests,board)?.score,100); assert.equal(bestFor(bests,demoBoard('test API failure'))?.score,200);
  saveBest(store,board,150); assert.equal(bestFor(readBests(store),board)?.score,150);
  assert.equal(readBests(store).length,2);
});
test('corrupt or blocked localStorage does not break a completed game', () => {
  assert.deepEqual(readBests({getItem:()=>'{bad',setItem:()=>{}}),[]);
  assert.equal(saveBest(null,demoBoard('test API failure'),20).saved,false);
  const blocked = {getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded');}};
  assert.equal(saveBest(blocked,demoBoard('test API failure'),20).saved,false);
});
