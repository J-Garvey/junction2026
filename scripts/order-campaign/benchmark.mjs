/** Fixed development benchmark manifest + attribution over existing campaign evidence. */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, createReadStream, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const buckets = [[1, 10], [11, 29], [30, 59], [60, 99], [100, 100]];
export function workload({ seed = 20261115, samples = 30, repeats = 2, fixtureSku = false } = {}) {
  if (!Number.isSafeInteger(samples) || samples < 1 || !Number.isSafeInteger(repeats) || repeats < 1) throw Error('positive samples/repeats required');
  let state = seed >>> 0;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  const products = [['milk', 'l'], ['butter', 'kg'], ['salmon', 'kg'], ['potatoes', 'kg'], ['bread', 'pcs'], ['eggs', 'pcs']];
  const base = buckets.flatMap(([min, max]) => Array.from({ length: samples }, (_, sample) => {
    const count = sample === 0 ? min : sample === 1 ? max : min + random() % (max - min + 1);
    const lines = Array.from({ length: count }, (_, i) => {
      const [productWord, unit] = products[(i + sample) % products.length];
      const amount = 1 + random() % 9;
      return fixtureSku ? { productWord: 'salmon', productId: '469672', amount, unit: 'kg' } : { productWord, amount, unit };
    });
    const input = lines.map(l => `${l.amount} ${l.unit} ${l.productWord}${l.productId ? ` ${l.productId}` : ''}`).join('; ');
    return { input, expected: { lines, scope: 'independently authored input semantics; no automatic verdict' }, itemCount: count,
      benchmark: { bucket: min === max ? String(min) : `${min}-${max}`, sample, shape: fixtureSku ? 'fixture-sku-literal' : 'compact-literal' } };
  }));
  const rows = Array.from({ length: repeats }, (_, pass) => base.map((row, index) => ({ ...row,
    caseId: `p1-fixed-${pass}-${String(index).padStart(3, '0')}`, channels: ['web-api', 'whatsapp'], plan: true,
    benchmark: { ...row.benchmark, pass, cacheCondition: pass ? 'repeat-in-same-process' : 'first-pass-process-cold-only-at-start' } }))).flat();
  for (const [label, chars] of [['web-limit', 2001], ['simulator-limit', 8001]]) rows.push({
    caseId: `p1-boundary-${label}`, channels: ['web-api', 'whatsapp'], input: 'x'.repeat(chars),
    expected: { scope: 'limit probe; rejection is distinct from semantic success' }, itemCount: 0,
    benchmark: { bucket: 'boundary', pass: 0, shape: label, cacheCondition: 'not-applicable' },
  });
  return rows;
}

export function distribution(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b), n = xs.length;
  const quantile = p => n ? xs[Math.ceil(p * n) - 1] : null;
  return { n, p50Ms: quantile(.5), p95Ms: n >= 30 ? quantile(.95) : null,
    observedP95Ms: quantile(.95), maxMs: n ? xs.at(-1) : null,
    uncertainty: n < 30 ? 'small sample: p95 not claimed' : 'descriptive repeated workload, one machine; no independent population CI' };
}
async function readRows(path, project) {
  const rows = [];
  const input = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of input) if (line.trim()) {
    const row = project(JSON.parse(line.replace(/^\uFEFF/, '')));
    if (row) rows.push(row);
  }
  return rows;
}
export async function summarize(dir) {
  dir = resolve(dir);
  // Project each complete line immediately: large SQL snapshots/raw payloads stay
  // in evidence on disk, never all resident in the report process at once.
  const raw = await readRows(resolve(dir, 'raw-observations.jsonl'), r => {
    if (r.kind === 'http-response') { const { rawText, body, response, ...rest } = r; return { ...rest, response: response?.plan ? { plan: { timings: response.plan.timings } } : null }; }
    if (r.kind === 'http-request') return { kind: r.kind, callId: r.callId, at: r.at };
    return ['run-start', 'host-config', 'run-complete'].includes(r.kind) ? r : null;
  });
  const rows = await readRows(resolve(dir, 'requests.jsonl'), r => {
    const saved = r.snapshots?.persistedAfter?.tables?.plans?.at(-1), parsed = r.response?.request ?? saved?.request;
    return { caseId: r.caseId, attemptId: r.attemptId, channel: r.channel, itemCount: r.itemCount, status: r.status, elapsedMs: r.elapsedMs,
      unsupported: r.unsupported, benchmark: r.benchmark, related: (r.related || []).map(c => ({ callId: c.callId, purpose: c.purpose })),
      response: { request: parsed ? { parsedBy: parsed.parsedBy, lines: { length: parsed.lines?.length } } : null,
        note: r.response?.note, status: r.response?.status, messages: [{ direction: 'outbound', reply: r.response?.messages?.findLast(m => m.direction === 'outbound')?.reply }] },
      snapshots: saved ? { persistedAfter: { tables: { plans: [{ timings: saved.timings }] } } } : null,
      telemetry: (r.telemetry || []).map(t => ({ kind: t.kind, status: t.status, schema: t.schema, elapsedMs: t.elapsedMs, usage: t.usage })) };
  });
  const responses = raw.filter(r => r.kind === 'http-response'), starts = raw.filter(r => r.kind === 'run-start');
  const requestedAt = new Map(raw.filter(r => r.kind === 'http-request').map(r => [r.callId, Date.parse(r.at)]));
  const requestPaths = new Set(['/api/messages', '/api/whatsapp/messages', '/api/requests']);
  const selectionIds = new Set(rows.flatMap(r => (r.related || []).filter(c => c.purpose === 'select-active-order').map(c => c.callId)));
  const useful = responses.filter(r => !String(r.attempt).startsWith('support') && requestPaths.has(r.path) && !selectionIds.has(r.callId));
  const support = responses.filter(r => String(r.attempt).startsWith('support') || selectionIds.has(r.callId));
  const groups = new Map();
  for (const row of rows) {
    const calls = useful.filter(r => r.attempt === row.attemptId), primary = calls.find(r => r.path !== '/api/requests');
    const savedPlan = row.snapshots?.persistedAfter?.tables?.plans?.at(-1);
    const parsed = row.response?.request ?? savedPlan?.request;
    const reply = row.response?.messages?.findLast(m => m.direction === 'outbound')?.reply;
    const planCall = calls.find(r => r.path === '/api/requests');
    const limit = row.status >= 400 && row.status < 500;
    const outcome = row.unsupported ? 'unsupported' : limit ? 'http-client-rejection' : row.status === null || row.status >= 500 ? 'http-error' :
      row.channel === 'main' ? parsed ? parsed.lines.length === row.itemCount ? `parsed-line-count-complete${planCall?.status >= 400 || planCall?.status === null ? '-plan-http-error' : ''}` : 'parsed-line-count-mismatch' : 'no-parsed-request' : `simulator-${reply?.status ?? row.response?.status ?? 'response'}`;
    const key = JSON.stringify([row.benchmark?.bucket, row.benchmark?.pass, row.benchmark?.shape, row.channel, outcome]);
    if (!groups.has(key)) groups.set(key, { stratum: JSON.parse(key), rows: [] });
    const models = (row.telemetry || []).filter(t => t.kind === 'model');
    const timings = planCall?.response?.plan?.timings ?? savedPlan?.timings;
    groups.get(key).rows.push({ caseId: row.caseId, attempt: row.attemptId, itemCount: row.itemCount,
      parsedLineCount: parsed?.lines?.length ?? null, parsedBy: parsed?.parsedBy ?? null, fallbackNote: row.response?.note ?? null,
      usefulMs: calls.reduce((n, c) => n + c.elapsedMs, 0), caseEnvelopeMs: row.elapsedMs,
      executionSpanMs: calls.length && requestedAt.has(calls[0].callId) ? Date.parse(calls.at(-1).at) - requestedAt.get(calls[0].callId) : null,
      headersMs: primary?.headersMs, firstByteMs: primary?.firstByteMs, primaryCompleteMs: primary?.bodyCompleteMs,
      primaryResponseBytes: primary?.responseBytes ?? null, planResponseBytes: planCall?.responseBytes ?? null,
      parseOrRouteHttpMs: row.channel === 'main' ? primary?.elapsedMs : null,
      planHttpMs: planCall?.elapsedMs ?? null, planTimings: timings ?? null,
      searchMs: timings?.searchMs, lookupMs: timings?.lookupMs, rankMs: timings?.rankMs, planningTotalMs: timings?.totalMs,
      modelCalls: models.length, modelStatuses: models.map(t => t.status), modelElapsedMs: models.reduce((n, t) => n + t.elapsedMs, 0),
      usage: models.map(t => t.usage), modelSchemas: models.map(t => t.schema),
      supplierBlocks: (row.telemetry || []).filter(t => t.kind === 'supplier_blocked').length });
  }
  const aggregate = groups.size ? [...groups.values()].map(g => ({ stratum: g.stratum, n: g.rows.length,
    timings: Object.fromEntries(['usefulMs', 'executionSpanMs', 'caseEnvelopeMs', 'headersMs', 'firstByteMs', 'primaryCompleteMs', 'parseOrRouteHttpMs', 'planHttpMs', 'searchMs', 'lookupMs', 'rankMs', 'planningTotalMs'].map(k => [k, distribution(g.rows.map(r => r[k]))])),
    modelCalls: g.rows.reduce((n, r) => n + r.modelCalls, 0), modelElapsedMs: g.rows.reduce((n, r) => n + r.modelElapsedMs, 0),
    parsedBy: Object.fromEntries([...new Set(g.rows.map(r => r.parsedBy ?? 'not-returned'))].map(mode => [mode, g.rows.filter(r => (r.parsedBy ?? 'not-returned') === mode).length])),
    notesReturned: g.rows.filter(r => r.fallbackNote).length,
    reportedUsage: g.rows.flatMap(r => r.usage).filter(Boolean), retries: null,
    supplierBlocks: g.rows.reduce((n, r) => n + r.supplierBlocks, 0), rows: g.rows })) : [];
  const totalMs = xs => xs.reduce((n, r) => n + r.elapsedMs, 0);
  const profiles = readdirSync(dir).filter(f => /^profile-.*\.json$/.test(f)).map(f => ({ file: f, ...JSON.parse(readFileSync(resolve(dir, f), 'utf8')) }));
  const profileRequests = [...new Map(profiles.flatMap(p => p.requests.map((r, i) => [`${i}:${r.attempt}:${r.path}`, r]))).values()];
  return { schema: 'p1-benchmark-v1', evidenceDir: dir, analyzerHash: hash(readFileSync(new URL(import.meta.url))),
    runStarts: starts.map(s => ({ runId: s.runId, runnerSha: s.runnerSha, runnerHash: s.runnerHash, manifest: s.manifest })),
    runCompletion: starts.map(s => ({ runId: s.runId, selected: s.selected?.length,
      completed: raw.some(r => r.kind === 'run-complete' && r.runId === s.runId),
      ...raw.find(r => r.kind === 'run-complete' && r.runId === s.runId)?.counters,
      manifestUnchanged: raw.find(r => r.kind === 'run-complete' && r.runId === s.runId)?.manifestUnchanged ?? null })),
    host: raw.find(r => r.kind === 'host-config')?.metadata, observations: rows.length, aggregate,
    accounting: { httpCalls: responses.length, usefulHttpMs: totalMs(useful), supportHttpMs: totalMs(support),
      supportByPath: Object.fromEntries([...new Set(support.map(r => r.path))].map(path => [path, { n: support.filter(r => r.path === path).length, totalMs: totalMs(support.filter(r => r.path === path)) }])),
      snapshotsHttpMs: totalMs(support.filter(r => r.path === '/campaign/state')),
      snapshotResponseBytes: support.filter(r => r.path === '/campaign/state').reduce((n, r) => n + (r.responseBytes ?? 0), 0),
      executionResponseBytes: useful.reduce((n, r) => n + (r.responseBytes ?? 0), 0),
      evidenceFileBytes: Object.fromEntries(['raw-observations.jsonl', 'requests.jsonl'].map(file => [file, statSync(resolve(dir, file)).size])),
      evidenceCosts: raw.filter(r => r.kind === 'run-complete').map(r => ({ runId: r.runId, elapsedMs: r.elapsedMs, ...r.evidenceCosts })),
      hostResJsonSyncMs: profileRequests.reduce((n, r) => n + r.resJsonSyncMs, 0),
      hostResJsonByPath: Object.fromEntries([...new Set(profileRequests.map(r => r.path))].map(path => [path, distribution(profileRequests.filter(r => r.path === path).map(r => r.resJsonSyncMs))])),
      maxObservedRssBytes: Math.max(0, ...profileRequests.map(r => r.rssAfterBytes)), eventLoop: profiles.map(p => p.eventLoop) },
    limitations: ['No semantic pass verdict: complete line count does not prove quantities, constraints or product identity.',
      'Simulator response is a workflow outcome, not proof of a complete semantic parse; inspect plans/snapshots independently.',
      'TTFU unavailable: these JSON routes do not stream useful content. Headers and first body byte are transport metrics; useful response arrives at full JSON completion.',
      'Useful HTTP sums parse+plan for web; simulator includes both. Execution span also includes intervening runner journaling (millisecond wall clock); case envelope additionally includes setup/support/snapshots. Totals overlap and must not be added.',
      'resJsonSyncMs includes Express stringify and synchronous send; it is not a pure serializer CPU measurement. CPU is process-wide; nested/concurrent calls overlap.',
      'Reset clears SQLite but preserves process search/model caches. First pass is cold only at process start; second pass is repeat traffic, not a guaranteed cache hit.',
      'Profile is opt-in harness overhead. Event-loop stats start when profiling is enabled, after module imports, and include setup/idle. No application-browser or real WhatsApp evidence.',
      'Model calls/status/usage are actual telemetry. Repeated schema calls are observable; automatic retries and fallback stages are not separately instrumented.',
      'All saved supplier data are fixtures; guarded fixture misses and HTTP rejections are distinct from successes.'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, target] = process.argv.slice(2);
  if (!target || !['prepare', 'summarize'].includes(command)) throw Error('benchmark.mjs prepare|summarize <external-directory>');
  const dir = resolve(target); mkdirSync(dir, { recursive: true });
  if (command === 'prepare') {
    const fixtureSku = process.argv.includes('--fixture-sku');
    const rows = workload({ fixtureSku }), bytes = rows.map(r => JSON.stringify(r)).join('\n') + '\n';
    writeFileSync(resolve(dir, 'workload.jsonl'), bytes, { flag: 'wx' });
    const paths = execFileSync('git', ['ls-files', 'apps/api/src', 'packages/contracts/src', 'scripts/order-campaign', 'data/products_slim.jsonl', 'data/ingredients.jsonl', 'data/fixtures/aimo'], { encoding: 'utf8' }).trim().split(/\r?\n/);
    const hashes = Object.fromEntries(paths.map(path => [path, hash(readFileSync(path))]));
    hashes['scripts/order-campaign/benchmark.mjs'] = hash(readFileSync(new URL(import.meta.url)));
    writeFileSync(resolve(dir, 'workload-config.json'), JSON.stringify({ schema: 'p1-fixed-v1', seed: 20261115, samples: 30, repeats: 2, fixtureSku,
      clock: '2026-11-14T10:00:00Z', codeSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      sha256: hash(bytes), records: rows.length, channels: ['web-api', 'syntheticWhatsApp via whatsapp'], hashes }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ records: rows.length, executions: rows.length * 2, sha256: hash(bytes) }));
  } else {
    const report = await summarize(dir), out = resolve(dir, `benchmark-summary-${Date.now()}.json`);
    writeFileSync(out, JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ out, observations: report.observations, accounting: report.accounting }));
  }
}
