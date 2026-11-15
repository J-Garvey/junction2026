import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadManifest, expandExecutions, executeSteps, resolveReferences } from '../campaign-v2-run.mjs';
import { appendEvidence } from '../evidence.mjs';

test('external JSONL is immutable, metadata survives, channel executions are separate', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'campaign-adapter-'));
  try {
    const path = resolve(dir, 'source.jsonl');
    const bytes = '\uFEFF' + JSON.stringify({ caseId: 'one', input: 'salmon', expected: { amount: 2 }, channels: ['web-api', 'gateway'], itemCount: 1, split: 'smoke', primaryCategory: 'quantity' }) + '\r\n';
    writeFileSync(path, bytes);
    const m = loadManifest(path);
    assert.equal(m.sha256.length, 64);
    assert.throws(() => { m.records[0].expected.amount = 999; }, TypeError);
    const cases = expandExecutions(m.records);
    assert.deepEqual(cases.map(c => c.channel), ['main', 'gateway']);
    assert.equal(cases[0].split, 'smoke');
    assert.notEqual(cases[0].executionId, cases[1].executionId);
    assert.equal(expandExecutions(m.records, 'api').length, 1);
    assert.equal(readFileSync(path, 'utf8'), bytes);
    writeFileSync(path, `${JSON.stringify(m.records[0])}\n${JSON.stringify(m.records[0])}`);
    assert.throws(() => loadManifest(path), /Duplicate/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('gateway free text is explicitly unsupported and no oracle supplies a payload', async () => {
  let sent = 0;
  const result = await executeSteps({ channel: 'gateway', input: '2 kg salmon', expected: { productId: '469672' } }, () => { sent++; });
  assert.match(result.unsupported, /no natural-language gateway equivalent/);
  assert.equal(sent, 0);
});

test('structured sequence resolves observed IDs, preserves retries and rejects escaping paths before requests', async () => {
  const sent = [];
  const result = await executeSteps({ channel: 'gateway', sequence: [
    { path: '/gateway/v1/quotes', body: { lines: [] }, saveAs: 'quote' },
    { path: '/gateway/v1/orders', headers: { 'Idempotency-Key': 'same' }, body: { quoteId: { $ref: 'quote.id' } } },
    { path: '/gateway/v1/orders', headers: { 'Idempotency-Key': 'same' }, body: { quoteId: { $ref: 'quote.id' } } },
  ] }, async step => { sent.push(step); return { status: 201, response: { id: 'observed-q' } }; });
  assert.equal(result.related.length, 3);
  assert.equal(sent[1].body.quoteId, 'observed-q');
  assert.deepEqual(sent[1], sent[2]);
  for (const path of ['https://example.com/gateway/v1/orders', '/gateway/v1/../../api/reset', '/gateway/v1/%2e%2e/%2e%2e/api/reset']) {
    await assert.rejects(executeSteps({ channel: 'gateway', sequence: [{ path: '/gateway/v1/orders' }, { path }] }, () => assert.fail('must validate all steps first')), /outside/);
  }
  assert.throws(() => resolveReferences({ $ref: 'quote.missing' }, { quote: {} }), /Unresolved/);
});

test('append-only evidence redacts credentials without shortening payloads', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'campaign-evidence-'));
  try {
    const path = resolve(dir, 'raw.jsonl'), long = 'x'.repeat(20000), secret = 'synthetic-private-value';
    appendEvidence(path, { token: secret, text: long, nested: { authorization: `Bearer ${secret}` }, rawText: `the value ${secret}`, jsonText: '{"nested":{"token":"another-private-value"}}' }, [secret]);
    const first = readFileSync(path, 'utf8');
    appendEvidence(path, { second: true });
    const after = readFileSync(path, 'utf8');
    assert.ok(after.startsWith(first));
    assert.equal(after.includes(secret), false);
    assert.equal(after.includes('another-private-value'), false);
    assert.equal(JSON.parse(first).text.length, 20000);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
