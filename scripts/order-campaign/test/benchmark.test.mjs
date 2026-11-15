import test from 'node:test';
import assert from 'node:assert/strict';
import { workload, distribution } from '../benchmark.mjs';

test('fixed benchmark preserves the whole workload and all bands on both passes', () => {
  const rows = workload();
  assert.deepEqual(rows, workload());
  assert.notEqual(JSON.stringify(rows), JSON.stringify(workload({ seed: 1 })));
  assert.equal(new Set(rows.map(r => r.caseId)).size, rows.length);
  for (const pass of [0, 1]) for (const bucket of ['1-10', '11-29', '30-59', '60-99', '100']) {
    const group = rows.filter(r => r.benchmark.pass === pass && r.benchmark.bucket === bucket);
    assert.equal(group.length, 30);
    for (const row of group) {
      assert.equal(row.input.split('; ').length, row.itemCount);
      assert.equal(row.expected.lines.length, row.itemCount);
      assert.ok(row.input.length <= 2000);
      assert.deepEqual(row.channels, ['web-api', 'whatsapp']);
    }
  }
  assert.deepEqual(rows.slice(0, 150).map(r => r.input), rows.slice(150, 300).map(r => r.input));
  assert.deepEqual(rows.slice(300).map(r => r.input.length), [2001, 8001]);
});

test('p95 claims require 30 valid observations', () => {
  assert.equal(distribution([1, 2, null, undefined, NaN]).n, 2);
  assert.equal(distribution(Array(29).fill(1)).p95Ms, null);
  assert.equal(distribution(Array.from({ length: 30 }, (_, i) => i)).p95Ms, 28);
  assert.equal(distribution([]).observedP95Ms, null);
});
