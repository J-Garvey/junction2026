/** Fixture-only loopback host. Never restores or opens a WhatsApp browser. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { appendEvidence, sanitize } from '../../../../../scripts/order-campaign/evidence.mjs';
import { installProfile } from './profile.js';

const port = Number(process.env.CAMPAIGN_PORT || 8891);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('CAMPAIGN_PORT must be 1024..65535');
const artifacts = resolve(process.env.CAMPAIGN_DIR || 'C:/Users/benfh/junction-trials/order-inputs-20261115');
const instanceId = randomUUID();
const runtime = resolve(process.env.CAMPAIGN_RUNTIME_DIR || resolve(artifacts, 'generator-runtime', instanceId));
mkdirSync(runtime, { recursive: true });
const dbPath = resolve(runtime, 'aimo.db'), authDir = resolve(runtime, 'whatsapp-unused');
if ([dbPath, `${dbPath}-wal`, `${dbPath}-shm`].some(existsSync) || (existsSync(authDir) && readdirSync(authDir).length)) throw Error('Campaign runtime must have a fresh DB and unused auth directory');
mkdirSync(authDir, { recursive: true });
process.env.PORT = String(port);
process.env.GATEWAY_URL = `http://127.0.0.1:${port}/gateway/v1`;
process.env.AIMO_DB = dbPath;
process.env.WHATSAPP_AUTH_DIR = authDir;
process.env.AIMO_MODE = 'fixture'; process.env.AIMO_SEARCH_LOG = 'off'; process.env.AIMO_TEST_MODE = '1'; process.env.PREVIEW_PASSWORD = '';
const realModel = process.env.CAMPAIGN_MODEL === 'real';
if (!realModel) process.env.OPENAI_API_KEY = '';
process.env.CONTEXT_DEV_API_KEY = '';
const { config } = await import('../../config.js');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
const context = new AsyncLocalStorage<{ attempt: string }>();
const telemetry: any[] = [];
const secrets = [config.aimoKey, config.openai.apiKey, config.signingKey].filter(Boolean);
const emit = (row: any) => {
  const safe = sanitize({ ...row, instanceId, seq: telemetry.length }, secrets);
  appendEvidence(resolve(artifacts, 'generator-telemetry.jsonl'), safe, secrets);
  appendEvidence(resolve(artifacts, row.kind === 'model' ? 'generator-model-telemetry.jsonl' : 'generator-supplier-guard.jsonl'), safe, secrets);
  telemetry.push(safe);
};
const nativeFetch = globalThis.fetch;
const ownOrigin = `http://127.0.0.1:${port}`;
const supplierOrigin = new URL(config.aimoBase).origin;
const modelBase = new URL(config.openai.baseUrl);
globalThis.fetch = async (input: any, init?: any) => {
  const url = new URL(String(input?.url ?? input)), attempt = context.getStore()?.attempt ?? null;
  const supplier = url.origin === supplierOrigin;
  const model = realModel && url.origin === modelBase.origin && (url.pathname === modelBase.pathname || url.pathname.startsWith(modelBase.pathname.replace(/\/$/, '') + '/'));
  if (supplier || (url.origin !== ownOrigin && !model)) {
    let body: any; try { body = JSON.parse(init?.body ?? '{}'); } catch { body = {}; }
    emit({ kind: supplier ? 'supplier_blocked' : 'egress_blocked', at: new Date().toISOString(), attempt, path: url.pathname, products: body.products ?? [], reason: 'campaign fixture-only network guard' });
    return new Response(JSON.stringify({ error: 'campaign_fixture_miss' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  const start = performance.now();
  try {
    const response = await nativeFetch(input, { ...init, redirect: 'error' });
    if (model) {
      let body: any; try { body = JSON.parse(init?.body ?? '{}'); } catch { body = {}; }
      const rawText = await response.clone().text();
      let responseBody: any; try { responseBody = JSON.parse(rawText); } catch { responseBody = { raw: rawText }; }
      emit({ kind: 'model', at: new Date().toISOString(), attempt, status: response.status, elapsedMs: Math.round(performance.now() - start), model: body.model, schema: body.text?.format?.name ?? body.response_format?.json_schema?.name ?? null, request: body, response: responseBody, rawText, usage: responseBody.usage ?? null });
    }
    return response;
  } catch (error) {
    if (model) emit({ kind: 'model', at: new Date().toISOString(), attempt, status: null, error: (error as Error).name, elapsedMs: Math.round(performance.now() - start) });
    throw error;
  }
};
const express = (await import('express')).default;
const { createApp } = await import('../../server.js');
const { getDb, kvGet } = await import('../../db.js');
const { setClock } = await import('../../clock.js');
const app = express();
const stopProfile = process.env.CAMPAIGN_PROFILE === '1' ? installProfile(app) : () => {};
app.use((req, _res, next) => context.run({ attempt: String(req.headers['x-campaign-attempt'] ?? 'support') }, next));
app.use('/api/whatsapp/web', (_req, res) => res.status(403).json({ error: 'campaign_real_transport_disabled', fixture: true }));
app.post('/campaign/fixture-remove-default-event', (_req, res) => {
  getDb().prepare('DELETE FROM events WHERE id = ?').run('evt-wedding');
  res.json({ fixture: true, removed: 'evt-wedding', reason: 'explicit no/one/several draft-order scenario' });
});
const fixtureHash = createHash('sha256').update(readFileSync(resolve(config.fixturesDir, 'base.json'))).digest('hex');
const repo = resolve(config.dataDir, '..');
const harnessHashes = Object.fromEntries(['apps/api/src/scripts/order-campaign/host.ts', 'apps/api/src/scripts/order-campaign/profile.ts', 'scripts/order-campaign/run.mjs', 'scripts/order-campaign/campaign-v2-run.mjs', 'scripts/order-campaign/evidence.mjs'].map(path => [path, createHash('sha256').update(readFileSync(resolve(repo, path))).digest('hex')]));
const metadata = { pid: process.pid, instanceId, sha, dirty, harnessHashes, repoRoot: repo, worktree: process.cwd(), mode: realModel ? 'real-model-enabled' : 'model-disabled', modelConfigured: !!config.openai.apiKey, model: config.openai.model, modelTimeoutMs: config.openai.timeoutMs, port, artifacts, runtime, dbPath, authDir, fixtureHash, supplierGuard: true, fixtureOnly: true, loopbackOnly: true, realTransportDisabled: true, autoResume: false, config: { gatewayUrl: config.gatewayUrl, aimoMode: config.aimoMode, testMode: config.testMode, node: process.version } };
app.get('/campaign/status', (_req, res) => res.json({ ...metadata, telemetryCount: telemetry.length, clock: kvGet('clock') }));
app.get('/campaign/telemetry', (req, res) => {
  const since = Number(req.query.since ?? 0);
  if (!Number.isSafeInteger(since) || since < 0) return res.status(400).json({ error: 'invalid telemetry cursor' });
  res.json({ events: telemetry.slice(since), count: telemetry.length, instanceId });
});
// A SQL snapshot avoids GET /api/baskets recomputing plans. Tokens stay private.
app.get('/campaign/state', (_req, res) => {
  const tables: Record<string, unknown[]> = {};
  for (const table of ['people', 'mandates', 'events', 'plans', 'questions', 'quotes', 'approvals', 'orders', 'audit', 'warnings', 'remembered', 'judgements']) {
    tables[table] = (getDb().prepare(`SELECT json FROM ${table} ORDER BY rowid`).all() as { json: string }[]).map(row => JSON.parse(row.json));
  }
  const kv = (getDb().prepare("SELECT key, value FROM kv WHERE key != 'agentToken' ORDER BY key").all() as { key: string; value: string }[]).map(row => ({ key: row.key, value: JSON.parse(row.value) }));
  res.json(sanitize({ fixture: true, instanceId, clock: kvGet('clock'), tables, kv, counts: Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, rows.length])) }, secrets));
});
app.use(createApp());
setClock({ time: '2026-11-14T10:00:00Z' });
const server = app.listen(port, '127.0.0.1', () => {
  mkdirSync(resolve(artifacts, 'generator-runtime'), { recursive: true });
  writeFileSync(resolve(artifacts, 'generator-runtime/server.json'), JSON.stringify(metadata, null, 2));
  writeFileSync(resolve(runtime, 'server.json'), JSON.stringify(metadata, null, 2));
  console.log(JSON.stringify(metadata));
});
const shutdown = () => { stopProfile(); server.close(() => process.exit(0)); };
process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
