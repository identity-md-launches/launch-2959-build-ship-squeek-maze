import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countLabel, resultCounts } from '../src/share';

test('result counts use singular nouns for exactly one and plural otherwise', () => {
  assert.equal(countLabel(1, 'Squeek'), '1 Squeek');
  assert.equal(countLabel(0, 'Squeek'), '0 Squeeks');
  assert.equal(countLabel(2, 'bump'), '2 bumps');
  assert.equal(resultCounts({ collected: 1, hits: 0 }), '1 Squeek · 0 bumps');
  assert.equal(resultCounts({ collected: 3, hits: 1 }, '  /  '), '3 Squeeks  /  1 bump');
});
