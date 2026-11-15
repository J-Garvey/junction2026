/** Read-only independent audit of named DEVELOPMENT evidence and E1 smoke.
 * Never discovers or opens corpus/holdout files. Does not run an app/campaign. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.argv[2] || !process.argv[3]) throw Error('Usage: node scripts/order-campaign/A3-inspect-evidence.mjs <campaign-root> <own-output-dir>');
const root = resolve(process.argv[2]), out = resolve(process.argv[3]);
mkdirSync(out, { recursive: true });
const sources = [];
function read(relative) {
  const path = resolve(root, relative), bytes = readFileSync(path);
  const rows = bytes.toString('utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  sources.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), rows: rows.length });
  return rows;
}
const baseline = read('baseline/requests.jsonl');
const smoke = read('E1/fallback-final/requests.jsonl').filter(r => r.phase === 'committed-smoke');
const checks = [];
function check(name, fn) { fn(); checks.push({ name, result: 'matched pre-authored E1 smoke semantics' }); }
const row = id => { const r = smoke.find(r => r.caseId === id && r.channel === 'gateway'); assert.ok(r, id); return r; };
const tables = r => r.snapshots.persistedAfter.tables;
check('milk allergy cannot be waived by lactose-free claim or approval', () => {
  const r = row('smoke-gateway-allergen-block');
  assert.ok(r.related[0].body.lines[0].requires.avoidAllergens.includes('AM'));
  assert.equal(r.related[0].response.outcome, 'block');
  assert.deepEqual(r.related.map(s => s.status), [201, 409, 409]);
  assert.equal(tables(r).orders.length, 0); assert.equal(tables(r).approvals.length, 0);
});
check('unknown stock remains unknown with no implicit purchase', () => {
  const r = row('smoke-gateway-unknown-stock');
  assert.ok(r.related[0].response.unconfirmedStock.includes('464306'));
  assert.equal(r.related[0].response.lines[0].stock.kind, 'unknown');
  assert.equal(r.related[1].response.error, 'stock_unconfirmed');
  assert.equal(tables(r).orders.length, 0);
});
check('expired cutoff creates no order', () => {
  const r = row('smoke-gateway-expired-cutoff');
  assert.equal(r.related[1].status, 409);
  assert.equal(r.related[1].response.error, 'cutoff_passed');
  assert.equal(tables(r).orders.length, 0);
});
check('spend approval persists fingerprint and exact committed quote', () => {
  const r = row('smoke-gateway-approval'), t = tables(r), q = r.related[0].response;
  assert.deepEqual(r.related.map(s => s.status), [201, 409, 201, 201]);
  assert.equal(t.approvals.length, 1); assert.equal(t.orders.length, 1);
  assert.equal(t.approvals[0].fingerprint, q.fingerprint);
  assert.equal(t.approvals[0].quoteId, q.id); assert.equal(t.orders[0].quoteId, q.id);
  assert.equal(t.orders[0].approvalId, t.approvals[0].id);
  assert.equal(t.orders[0].totalExVat, q.totalExVat);
  assert.ok(t.approvals[0].grants.includes('spend_cap'));
});
check('fixed price and identical idempotency retry produce one persisted order', () => {
  const r = row('smoke-gateway-order-retry'), t = tables(r), q = r.related[0].response;
  assert.deepEqual(r.related.map(s => s.status), [201, 201, 200]);
  assert.equal(t.orders.length, 1); assert.equal(r.related[1].response.id, r.related[2].response.id);
  assert.equal(t.orders[0].lines[0].unitPrice, q.lines[0].unitPrice);
  assert.equal(t.orders[0].totalExVat, q.totalExVat);
});
// Deterministic representative sample, including the literal dietary phrase
// whose association must be inspected directly; no automatic corpus verdict.
const samples = [];
for (const [category, channel, limit] of [['ordinary', 'main', 3], ['ordinary', 'whatsapp', 2], ['long', 'main', 2], ['conversation', 'whatsapp', 3]]) {
  samples.push(...baseline.filter(r => r.primaryCategory === category && r.channel === channel).slice(0, limit));
}
const milk = baseline.find(r => r.channel === 'main' && typeof r.input === 'string' && /requirements: lactose-free and free from milk/.test(r.input));
if (milk && !samples.includes(milk)) samples.push(milk);
const projected = samples.map(r => ({
  caseId: r.caseId, channel: r.channel, phase: r.phase, attemptId: r.attemptId, sha: r.sha,
  input: r.input, status: r.status, parsedRequest: r.response?.request ?? null,
  response: r.channel === 'whatsapp' ? r.response : undefined,
  independentPreAuthoredExpected: r.expected,
  related: r.related, persistedBefore: r.snapshots?.persistedBefore,
  persistedAfter: r.snapshots?.persistedAfter,
}));
writeFileSync(resolve(out, 'representative-baseline.json'), JSON.stringify(projected, null, 2));
const result = { scope: 'Independent read-only E1 checks and representative DEVELOPMENT baseline extraction. No corpus-v3 or holdout accessed; no broad semantic pass claim.', sources, smokeChecks: checks,
  baselineRows: baseline.length, representative: projected.map(r => ({ caseId: r.caseId, channel: r.channel, status: r.status,
    parsedLines: r.parsedRequest?.lines?.length, expectedLines: r.independentPreAuthoredExpected?.lines?.length,
    finalCounts: r.persistedAfter?.counts,
    finalPlanStatus: r.persistedAfter?.tables?.plans?.map(p => p.status),
  })) };
writeFileSync(resolve(out, 'saved-evidence-audit.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
