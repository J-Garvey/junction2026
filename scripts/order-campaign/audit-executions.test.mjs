import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { hash, inputHash, quantity, loadCorpus, scanJsonl, callsFor, checkLines, persisted, setupFor, factualClaims, auditObservation, auditFile } from './audit-executions.mjs';
import { sourcePack } from './audit-executions-sources.mjs';

const line = (extra = {}) => ({ lineId: 'L001', productId: 'milk', amount: 2, unit: 'l', claims: ['FREE_FROM_LACTOSE'], avoidAllergens: ['AN'], origin: 'fi', ...extra });
const parsed = (extra = {}) => ({ productId: 'milk', quantity: { amount: 2000, unit: 'ml' }, constraints: { claims: ['FREE_FROM_LACTOSE'], avoidAllergens: ['AN'], origin: 'fi' }, ...extra });
const frozen = (extra = {}) => ({ caseId: 'test', input: 'two litres of specified milk', channels: ['main', 'whatsapp'], primaryCategory: 'ordinary', split: 'development', itemCount: 1, plan: true, expected: { lines: [line()], noAutomaticPurchaseFromText: true }, ...extra });
const tables = () => ({ events: [], plans: [], orders: [], approvals: [], quotes: [] });
const observed = (extra = {}) => ({ ...frozen(), attemptId: 'a', runId: 'run', channel: 'main', modelMode: 'model-disabled', status: 200,
  http: { path: extra.channel === 'whatsapp' ? '/api/whatsapp/messages' : '/api/messages', body: { text: extra.input || frozen().input } },
  response: { request: { lines: [parsed()] } }, snapshots: { persistedBefore: { tables: tables() }, persistedAfter: { tables: tables() } }, ...extra });
async function temporary(fn) {
  const dir = mkdtempSync(resolve(tmpdir(), 'execution-audit-'));
  try { await fn(dir); } finally { assert.equal(dirname(dir), resolve(tmpdir())); assert.ok(basename(dir).startsWith('execution-audit-')); rmSync(dir, { recursive: true }); }
}
function miniCorpus(dir) {
  const r = frozen(), text = JSON.stringify(r) + '\n', commitments = JSON.stringify({ scenarioId: r.caseId, contentHash: hash(r) }) + '\n';
  const manifest = { version: 2, campaignId: 'api-quality-20261115-c8a4', clock: '2026-11-14T10:00:00Z', files: { 'development.jsonl': { sha256: hash(text) }, 'commitments.jsonl': { sha256: hash(commitments) } } };
  writeFileSync(resolve(dir, 'development.jsonl'), text); writeFileSync(resolve(dir, 'commitments.jsonl'), commitments); writeFileSync(resolve(dir, 'checksums.json'), JSON.stringify(manifest)); return r;
}

test('equivalent units preserve quantity without inventing mass/volume density', () => {
  assert.deepEqual(quantity(2000, 'g'), { amount: 2, unit: 'kg' });
  assert.equal(checkLines([line()], [parsed()]).complete, true);
  assert.equal(checkLines([line()], [parsed({ quantity: { amount: 2, unit: 'kg' } })]).quantityDifferences, 1);
});
test('line-bound diet, allergens and origin cannot be satisfied by detached response fragments', () => {
  const r = checkLines([line()], [parsed({ constraints: {} }), parsed({ productId: null })]);
  assert.equal(r.lostClaims, 1); assert.equal(r.lostAllergens, 1); assert.equal(r.lostOrigins, 1); assert.equal(r.unaccountedParsedPositions, 1); assert.equal(r.complete, false);
});
test('missing quantity and silently dropped position are independently visible', () => {
  const r = checkLines([line(), line({ lineId: 'L002', productId: 'bread' })], [parsed({ quantity: null })]);
  assert.equal(r.missingPositions, 1); assert.equal(r.missingQuantities, 1);
});
test('compatible repeats may merge; incompatible neighbor requirements remain separate', () => {
  const a = line(), b = line({ lineId: 'L002', amount: 3 });
  assert.equal(checkLines([a, b], [parsed({ quantity: { amount: 5, unit: 'l' } })]).complete, true);
  b.origin = 'no';
  const r = checkLines([a, b], [parsed({ quantity: { amount: 5, unit: 'l' } })]);
  assert.equal(r.complete, false); assert.equal(r.missingPositions, 1);
});
test('explicitly authorized alternative is allowed, unlisted substitute is missing', () => {
  const l = line({ selection: { acceptedProductIds: ['milk', 'approved-milk'] } });
  assert.equal(checkLines([l], [parsed({ productId: 'approved-milk' })]).complete, true);
  assert.equal(checkLines([l], [parsed({ productId: 'other-milk' })]).missingPositions, 1);
});
test('v2 observed perfect parse never approves disputed plan arithmetic', () => {
  const o = observed(), copy = structuredClone(o); const v = auditObservation(o, frozen());
  assert.equal(v.disposition, 'ambiguous_expectation'); assert.equal(v.interpretation, 'complete_parse_only'); assert.deepEqual(o, copy);
});
test('parse-only independent pass has explicitly limited scope', () => {
  const f = frozen({ plan: false }); const v = auditObservation(observed(), f);
  assert.equal(v.disposition, 'pass'); assert.equal(v.interpretation, 'complete_parse_only');
});
test('response-carried expectations cannot replace frozen expectations', () => {
  const o = observed({ expected: { lines: [] }, response: { request: { lines: [] } } });
  assert.equal(auditObservation(o, frozen()).disposition, 'fail');
});
test('changed input or turn sequence cannot reuse any semantic score', () => {
  assert.equal(auditObservation(observed({ input: 'different' }), frozen()).disposition, 'ambiguous_expectation');
  assert.notEqual(inputHash(frozen()), inputHash(frozen({ sequence: ['different'] })));
});
test('safe HTTP rejection fails completeness while unsupported execution is not executed', () => {
  const v = auditObservation(observed({ status: 422, response: {} }), frozen());
  assert.equal(v.disposition, 'fail'); assert.equal(v.safeRejection, true); assert.equal(v.interpretation, 'rejected');
  assert.equal(auditObservation(observed({ unsupported: 'no natural-language gateway' }), frozen()).disposition, 'not_executed');
});
test('transport/server exceptions are distinct from semantic failure', () => {
  assert.equal(auditObservation(observed({ status: 503 }), frozen()).disposition, 'infrastructure_failure');
  assert.equal(auditObservation(observed({ status: null, error: { name: 'TimeoutError' } }), frozen()).disposition, 'infrastructure_failure');
});
test('persisted unauthorized purchase fails even if reply says clarification', () => {
  const o = observed(); o.snapshots.persistedAfter.tables.orders.push({ id: 'bad-order' });
  const v = auditObservation(o, frozen()); assert.equal(v.disposition, 'fail'); assert.ok(v.reasons.includes('persisted_order_without_purchase_authority'));
  assert.equal(persisted(o).counts.orders.after, 1);
});
test('v3 requires exact setup and execution manifest hashes', () => {
  const f = frozen({ revision: { version: 3 } }), o = observed();
  const v = auditObservation(o, f, { executionManifestHash: 'frozen-sha' });
  assert.equal(v.disposition, 'infrastructure_failure'); assert.ok(v.reasons.includes('v3_pre_execution_setup_hash_missing_or_different'));
  o.manifestSha256 = 'frozen-sha'; o.fixtureHash = 'fixture'; o.scenario = { person: 'p-aino', clock: '2026-11-14T10:00:00Z' }; o.setupHash = hash(setupFor(o));
  assert.equal(auditObservation(o, f, { executionManifestHash: 'frozen-sha', expectedFixtureHash: 'fixture' }).disposition, 'ambiguous_expectation');
});
test('counts deduplicate primary HTTP copy and distinguish selection and transport retry', () => {
  const o = observed({ http: { path: '/api/whatsapp/messages', body: { id: '1', text: 'add milk' } }, related: [
    { callId: 'select', path: '/api/whatsapp/messages', body: { id: 'select' }, purpose: 'select-active-order' },
    { callId: 'primary', path: '/api/whatsapp/messages', body: { id: '1', text: 'add milk' } },
    { callId: 'retry', path: '/api/whatsapp/messages', body: { id: '1', text: 'add milk' }, purpose: 'same-delivery-id-retry' } ] });
  assert.equal(callsFor(o).length, 3); const c = auditObservation(o, frozen()).counts;
  assert.equal(c.http, 3); assert.equal(c.conversationDeliveries, 1); assert.equal(c.selectionSupportDeliveries, 1); assert.equal(c.retryDeliveries, 1);
});
test('scanner excludes partial UTF-8 tail and appends after initial file boundary', async () => temporary(async dir => {
  const path = resolve(dir, 'live.jsonl'); writeFileSync(path, '{"x":"ä"}\n{"x":'); let n = 0;
  const r = await scanJsonl(path, () => { n++; appendFileSync(path, '2}\n'); });
  assert.equal(n, 1); assert.equal(r.trailingBytes, 5); assert.equal(r.completeSha256, hash('{"x":"ä"}\n'));
}));
test('malformed complete line is retained as an audit failure rather than skipped', async () => temporary(async dir => {
  const p = resolve(dir, 'bad.jsonl'); writeFileSync(p, '{}\nnot-json\n'); const seen = [];
  const r = await scanJsonl(p, (row, meta) => seen.push([row, meta])); assert.equal(r.malformed, 1); assert.equal(seen[1][1].line, 2);
}));
test('loader validates anchored bytes and never needs a holdout file by default', async () => temporary(async dir => {
  miniCorpus(dir); const p = resolve(dir, 'commitments.jsonl'); assert.equal(loadCorpus(dir, p).records.length, 1);
  appendFileSync(resolve(dir, 'development.jsonl'), ' '); assert.throws(() => loadCorpus(dir, p), /Checksum/);
}));
test('full audit preserves observations, refuses verdict overwrite and accounts missing channel', async () => temporary(async dir => {
  miniCorpus(dir); const p = resolve(dir, 'requests.jsonl'), text = JSON.stringify(observed()) + '\n'; writeFileSync(p, text);
  const args = { observations: p, corpus: dir, commitments: resolve(dir, 'commitments.jsonl'), output: resolve(dir, 'audit') };
  const s = await auditFile(args); assert.equal(s.channels.whatsapp.not_executed, 1); assert.equal(readFileSync(p, 'utf8'), text); await assert.rejects(auditFile(args), /EEXIST/);
}));
test('source pack rounding uses manufacturer content and API sales unit, never rounded-money ratio', () => {
  const f = sourcePack(line({ amount: 40, unit: 'kg' }), { bu: 'ST', units: { ST: 1 }, net_kg: 1.6, net_src: 'synkka' }, { catalogPrice: { value: 25.15 }, comparisonPrice: { value: 15.72 }, comparisonUnit: 'KG' }, { scheduleLines: [{ salesUnit: 'ST' }] });
  assert.equal(f.packs, 25); assert.equal(cent(f.packs * 25.15), 628.75);
  function cent(n) { return Math.round(n * 100) / 100; }
});
test('conflicting or inferred content and dairy custom unit remain unknown', () => {
  const p = { units: { ST: 1, ZML: 1 }, net_kg: 1.6, net_src: 'synkka' }, quote = { catalogPrice: { value: 25.15 }, comparisonPrice: { value: 20 }, comparisonUnit: 'KG' };
  assert.equal(sourcePack(line({ amount: 40, unit: 'kg' }), p, quote, { scheduleLines: [{ salesUnit: 'ST' }] }), null);
  assert.equal(sourcePack(line(), p, quote, { scheduleLines: [{ salesUnit: 'ZML' }] }), null);
});
test('invalid requested amounts do not erase independently known pack content or create negative packs', () => {
  const p = { units: { ST: 1 }, net_kg: 1.6, net_src: 'synkka' }, price = { catalogPrice: { value: 25.15 }, comparisonPrice: { value: 15.72 }, comparisonUnit: 'KG' }, a = { scheduleLines: [{ salesUnit: 'ST' }] };
  for (const amount of [0, -5, null]) { const f = sourcePack(line({ amount, unit: 'kg' }), p, price, a); assert.equal(f.size, 1.6); assert.equal(f.packs, null); }
});
test('explicit stock and pack assertions are independently checked, separate from actual ordering', () => {
  const sources = { catalog: new Map([['milk', { units: { ST: 1 }, bu: 'ST', net_kg: 1.6, net_src: 'synkka', claims: [] }]]),
    fixture: { availability: { milk: { logisticModel: 'Stock', scheduleLines: [{ salesUnit: 'ST', availableDate: '2026-11-16', availableAmount: 9999999999 }] } },
      price: { milk: { catalogPrice: { value: 25.15 }, comparisonPrice: { value: 15.72 }, comparisonUnit: 'KG' } } } };
  const candidate = { productId: 'milk', stock: { kind: 'known', amount: 9999999999 }, packContent: { verified: true, value: 25.15 / 15.72, unit: 'kg' } };
  const o = { related: [{ response: { plan: { id: 'p', needs: [{ id: 'n', constraints: { claims: ['VEGAN'] }, candidates: [candidate] }] } } }] };
  const r = factualClaims(o, sources); assert.equal(r.knownStockWithoutEvidence, 1); assert.equal(r.verifiedPackDisagrees, 1); assert.equal(r.dietaryCandidateMismatches, 1);
});
test('HTTP rejection retaining old pending authority is never called safe', () => {
  const o = observed({ channel: 'whatsapp', status: 400 });
  o.snapshots.persistedAfter.kv = [{ key: 'whatsapp:person:p-aino', value: { session: { conversation: { pending: { kind: 'add_items' } } } } }];
  assert.equal(auditObservation(o, frozen()).safeRejection, false);
});
test('matching declared input cannot disguise different wire payloads', () => {
  const o = observed({ http: { path: '/api/messages', body: { text: 'different order' } } });
  const v = auditObservation(o, frozen({ plan: false })); assert.equal(v.disposition, 'ambiguous_expectation'); assert.ok(v.reasons.includes('actual_http_payloads_do_not_match_frozen_sequence'));
});
