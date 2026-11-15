import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal HTTP peer tests journal durability, not application semantics.
test('runner appends complete raw exchanges before summaries and captures persisted state', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'campaign-runner-'));
  const source = resolve(dir, 'external.jsonl');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const runnerHash = createHash('sha256').update(readFileSync(new URL('../run.mjs', import.meta.url))).digest('hex');
  const long = 'x'.repeat(12000), requests = [];
  let port;
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    requests.push({ path: req.url, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/campaign/status') return res.end(JSON.stringify({ sha, harnessHashes: { 'scripts/order-campaign/run.mjs': runnerHash }, supplierGuard: true, fixtureOnly: true, realTransportDisabled: true, mode: 'model-disabled', port, artifacts: dir, instanceId: 'peer' }));
    if (req.url === '/api/session') return res.end(JSON.stringify({ token: 'private-session-value' }));
    if (req.url === '/campaign/state') return res.end(JSON.stringify({ tables: { orders: [], approvals: [] }, counts: { orders: 0, approvals: 0 } }));
    if (req.url.startsWith('/campaign/telemetry')) return res.end(JSON.stringify({ count: 0, events: [] }));
    if (req.url === '/api/messages') {
      const prior = readFileSync(resolve(dir, 'raw-observations.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.ok(prior.some(r => r.kind === 'http-request' && r.path === '/api/messages'));
      assert.equal(existsSync(resolve(dir, 'requests.jsonl')), false);
      return res.end(JSON.stringify({ received: body.text, token: 'private-response-value' }));
    }
    return res.end('{}');
  });
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    port = server.address().port;
    const corpus = JSON.stringify({ caseId: 'long', input: long, expected: { noTruncation: true }, channels: ['web-api', 'gateway'], itemCount: 60, split: 'smoke' }) + '\n';
    writeFileSync(source, corpus);
    const outcome = await new Promise((resolveRun, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('../run.mjs', import.meta.url)), `--manifest=${source}`, `--dir=${dir}`, `--port=${port}`], { windowsHide: true });
      let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
      child.once('error', reject); child.once('exit', code => resolveRun({ code, output }));
    });
    assert.equal(outcome.code, 0, outcome.output);
    assert.equal(readFileSync(source, 'utf8'), corpus);
    const rawText = readFileSync(resolve(dir, 'raw-observations.jsonl'), 'utf8');
    assert.equal(rawText.includes('private-session-value'), false);
    assert.equal(rawText.includes('private-response-value'), false);
    const raw = rawText.trim().split('\n').map(JSON.parse);
    assert.equal(raw.filter(r => r.kind === 'http-request').length, raw.filter(r => r.kind === 'http-response').length);
    assert.ok(raw.some(r => r.kind === 'run-initial-state'));
    assert.ok(raw.some(r => r.kind === 'run-final-state'));
    assert.equal(requests.find(r => r.path === '/api/messages').body.text.length, 12000);
    assert.equal(requests.filter(r => r.path === '/api/messages').length, 1);
    assert.equal(requests.some(r => r.path.startsWith('/gateway/v1')), false);
    const rows = readFileSync(resolve(dir, 'requests.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].verdict, 'not_evaluated');
    assert.equal(rows[1].executionState, 'unsupported');
    assert.equal(rows[0].snapshots.persistedAfter.counts.orders, 0);
    assert.equal(existsSync(resolve(dir, 'runner.lock')), false);
  } finally { await new Promise(r => server.close(r)); rmSync(dir, { recursive: true, force: true }); }
});
