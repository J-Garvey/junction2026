/** Local before-change parser/search profile. HTTP coverage stays in run.mjs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [manifest, output] = process.argv.slice(2);
if (!manifest || !output) throw Error('benchmark.ts <P1 workload.jsonl> <external output.json>');
process.env.OPENAI_API_KEY = '';
process.env.CONTEXT_DEV_API_KEY = '';
process.env.AIMO_MODE = 'fixture';
process.env.AIMO_SEARCH_LOG = 'off';
process.env.AIMO_DB = ':memory:';
globalThis.fetch = async () => { throw Error('No network in local P1 benchmark'); };
const { rulesParse, parseSimpleRequest } = await import('../../agent/parse.js');
const { searchMatches } = await import('../../catalog.js');
const bytes = readFileSync(manifest);
const rows = bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const samples: Record<string, unknown>[] = [];
for (const row of rows.filter(r => r.benchmark.shape === 'compact-literal')) {
  for (const [name, parse] of [['rulesParse', rulesParse], ['parseSimpleRequest', parseSimpleRequest]] as const) {
    const start = performance.now();
    const parsed = parse(row.input);
    const elapsedMs = performance.now() - start, serializeStart = performance.now();
    const json = JSON.stringify(parsed);
    const stringifyMs = performance.now() - serializeStart;
    samples.push({ kind: name, caseId: row.caseId, ...row.benchmark, itemCount: row.itemCount,
      elapsedMs, stringifyMs, bytes: Buffer.byteLength(json), parsedLines: parsed?.lines.length ?? null });
  }
}
const queries = ['milk', 'butter', 'salmon', 'potatoes', 'bread', 'eggs', 'coffee', 'cream', 'cheese', 'rice',
  'salmon fillet', 'chicken burger', 'oat milk', 'cream cheese', 'whole milk', 'whipping cream', 'cooking cream',
  'rye bread', 'wheat flour', 'olive oil', 'orange juice', 'apple juice', 'ground beef', 'chicken breast',
  'frozen peas', 'green beans', 'tomatoes', 'cucumber', 'carrots', 'onions'];
for (let pass = 0; pass < 2; pass++) for (const [index, q] of queries.entries()) {
  const start = performance.now();
  const result = searchMatches({ q, limit: 50 });
  samples.push({ kind: 'searchMatches', pass, query: q,
    cacheCondition: pass ? 'exact-repeat' : index ? 'first-query-search-cache-miss' : 'process-cold-includes-catalog-load',
    elapsedMs: performance.now() - start,
    resultHash: createHash('sha256').update(JSON.stringify(result.map(m => [m.product.id, m.tier, m.role]))).digest('hex') });
}
writeFileSync(output, JSON.stringify({ sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  manifest, manifestSha256: createHash('sha256').update(bytes).digest('hex'), node: process.version,
  model: 'disabled; direct deterministic functions; network refused', samples, rssBytes: process.memoryUsage().rss,
  limitations: ['Local functions are not HTTP end-to-end latency.', 'First cold search includes catalog loading; only 29 other unique misses, so no cold p95 claim.',
    'rulesParse and parseSimpleRequest are measured independently; they are not additive stages.', 'No pass verdict from line counts.'] }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ output, samples: samples.length }));
