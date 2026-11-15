import test from 'node:test';
import assert from 'node:assert/strict';
import { workload, distribution, summarize } from '../benchmark.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  const fixtureRows = workload({ fixtureSku: true });
  assert.equal(fixtureRows[120].input.length, 1998);
  assert.ok(fixtureRows.slice(0, 300).every(r => r.expected.lines.every(l => l.productId === '469672')));
});

test('p95 claims require 30 valid observations', () => {
  assert.equal(distribution([1, 2, null, undefined, NaN]).n, 2);
  assert.equal(distribution(Array(29).fill(1)).p95Ms, null);
  assert.equal(distribution(Array.from({ length: 30 }, (_, i) => i)).p95Ms, 28);
  assert.equal(distribution([]).observedP95Ms, null);
});

test('report excludes chat selection and separates failed planning from complete parses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p1-summary-'));
  try {
    const raw = [
      { kind: 'http-response', attempt: 'a', callId: 'parse', path: '/api/messages', elapsedMs: 2, bodyCompleteMs: 1 },
      { kind: 'http-response', attempt: 'a', callId: 'plan', path: '/api/requests', status: 503, elapsedMs: 3, response: { error: 'fixture miss' } },
      { kind: 'http-response', attempt: 'b', callId: 'select', path: '/api/whatsapp/messages', status: 200, elapsedMs: 100 },
      { kind: 'http-response', attempt: 'b', callId: 'message', path: '/api/whatsapp/messages', status: 200, elapsedMs: 7, firstByteMs: 6 },
    ];
    const rows = [
      { attemptId: 'a', channel: 'main', status: 200, itemCount: 1, response: { request: { lines: [{}], parsedBy: 'rules' } }, benchmark: { bucket: '1-10', pass: 0 } },
      { attemptId: 'b', channel: 'whatsapp', status: 200, response: { messages: [{ direction: 'outbound', reply: { status: 'proposal' } }] }, related: [{ purpose: 'select-active-order', callId: 'select' }], benchmark: { bucket: '1-10', pass: 0 } },
      { attemptId: 'c', channel: 'main', status: null, error: { message: 'support /api/reset HTTP null' }, benchmark: { bucket: '100', pass: 0 } },
      { attemptId: 'd', channel: 'main', status: 200, response: { request: { lines: [{}], parsedBy: 'openai' } }, benchmark: { bucket: 'model-smoke', pass: 0 } },
    ];
    writeFileSync(join(dir, 'raw-observations.jsonl'), raw.map(JSON.stringify).join('\n'));
    writeFileSync(join(dir, 'requests.jsonl'), rows.map(JSON.stringify).join('\n'));
    const report = await summarize(dir);
    assert.equal(report.accounting.usefulHttpMs, 12);
    assert.equal(report.accounting.supportHttpMs, 100);
    assert.equal(report.aggregate[0].stratum[4], 'parsed-line-count-complete-plan-http-error');
    assert.equal(report.aggregate[1].stratum[4], 'simulator-proposal');
    assert.equal(report.aggregate[1].timings.firstByteMs.p50Ms, 6);
    assert.equal(report.aggregate[2].stratum[4], 'support-error');
    assert.equal(report.aggregate[2].timings.usefulMs.n, 0);
    assert.equal(report.aggregate[3].stratum[4], 'parsed-count-not-scored');
    assert.ok(report.aggregate.every(g => g.timings.usefulMs.p95Ms === null));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
