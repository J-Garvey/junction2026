import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { clock, oracleForLine, packFact, sharedStock } from './corpus-v3-oracle.mjs';
import { stateScenario } from './corpus-v3-state.mjs';
import { loadSources, recomputeLines, loadRevision, commitmentFor, sha256, jsonl } from './corpus-v3.mjs';
import { auditBaseline } from './corpus-v3-audit.mjs';

const sources = loadSources();
const line = (productId, amount, unit, extra = {}) => ({ lineId: 'L001', productId, product: sources.catalog.get(productId)?.en, amount, unit, claims: [], avoidAllergens: [], ...extra });
const check = (l, price = sources.fixture.price[l.productId], availability = sources.fixture.availability[l.productId], date) => oracleForLine(l, sources.catalog.get(l.productId), price, availability, date);
test('manufacturer 1.6 kg cheesecake: 40 kg is 25 units and EUR 628.75', () => {
  const o = check(line('464856', 40, 'kg'));
  assert.equal(o.packSize, 1.6); assert.equal(o.packs, 25); assert.equal(o.totalEur, 628.75);
  assert.equal(o.packEvidence.status, 'verified');
  assert.equal(Math.ceil(40 / (25.15 / 15.72)), 26);
});
test('100 x 2 cl case is 2 L, never a 21st pack caused by cent rounding', () => {
  const o = check(line('463203', 40000, 'ml'));
  assert.equal(o.packSize, 2); assert.equal(o.packs, 20); assert.equal(o.totalEur, 301.8);
  assert.equal(o.commitAllowed, true);
});
test('API sales unit controls hierarchy and uncertain conversions remain unknown', () => {
  const p = { net_src: 'synkka', net_kg: 1.6, bu: 'ST', su: 'ST', units: { ST: 1, KI: 4 } };
  const price = { catalogPrice: { value: 100.6 }, comparisonPrice: { value: 15.72 }, comparisonUnit: 'KG' };
  const availability = { scheduleLines: [{ salesUnit: 'KI' }] };
  assert.equal(packFact(p, price, availability, 'KG').packSize, 6.4);
  assert.equal(packFact({ ...p, net_src: 'name' }, price, availability, 'KG').packSize, null);
  assert.equal(packFact(p, { ...price, comparisonPrice: { value: 20 } }, availability, 'KG').reason, 'manufacturer_API_comparison_conflict');
  assert.equal(packFact({ ...p, units: { ZML: 4 } }, price, { scheduleLines: [{ salesUnit: 'ZML' }] }, 'KG').packSize, null);
});
test('missing/invalid/late dates and zero stock without delivery never confirm deliverability', () => {
  const l = line('469363', 2, 'l'), a = sources.fixture.availability[l.productId];
  for (const date of [null, '2026-02-30', 'bad']) {
    const o = check(l, undefined, { ...a, scheduleLines: [{ ...a.scheduleLines[0], availableDate: date, availableAmount: 0 }] });
    assert.ok(o.blocks.includes('missing_or_invalid_delivery_date')); assert.equal(o.stock, 'unknown'); assert.equal(o.commitAllowed, false);
  }
  const late = check(l, undefined, { ...a, scheduleLines: [{ ...a.scheduleLines[0], availableDate: '2026-11-17' }] });
  assert.ok(late.questions.includes('delivery_later_than_requested')); assert.equal(late.commitAllowed, false);
  assert.ok(check(l, undefined, undefined, null).questions.includes('delivery_date_required'));
  assert.ok(check(l, undefined, undefined, '2026-02-30').blocks.includes('invalid_requested_date'));
  assert.ok(check(l, undefined, undefined, '2026-11-13').blocks.includes('past_requested_date'));
});
test('price validity handles actual timestamp format, expired/future/missing validity and reprice', () => {
  const l = line('469363', 2, 'l'), p = sources.fixture.price[l.productId];
  assert.equal(check(l).priceValidity.commitAndDeliveryCovered, true);
  for (const patch of [{ validTo: '2026-11-13T23:59:59+0200' }, { validFrom: '2026-11-17' }, { validTo: '2026-11-15' }]) {
    const o = check(l, { ...p, catalogPrice: { ...p.catalogPrice, ...patch } });
    assert.ok(o.questions.includes('price_not_valid_at_commit_or_delivery')); assert.equal(o.commitAllowed, false);
  }
  const missing = check(l, { ...p, catalogPrice: { ...p.catalogPrice, validTo: null } });
  assert.ok(missing.unknowns.includes('price_validity_unverified')); assert.equal(missing.commitAllowed, false);
  assert.ok(check(l, { ...p, error: true }).blocks.includes('price_unavailable'));
});
test('expired cutoffs and stock sentinels cannot become confirmed stock orders', () => {
  const l = line('469363', 2, 'l'), a = sources.fixture.availability[l.productId];
  assert.ok(check(l, undefined, { ...a, closingTime: clock }).blocks.includes('expired_cutoff'));
  for (const [logisticModel, availableAmount] of [['Terminal', 999999], ['Stock', 9999999999]]) {
    const o = check(l, undefined, { ...a, logisticModel, scheduleLines: [{ ...a.scheduleLines[0], availableAmount }] });
    assert.equal(o.stock, 'unknown'); assert.equal(o.availableSalesUnits, null); assert.equal(o.commitAllowed, false);
  }
});
test('diet failures stay blocked even where a monetary approver could approve', () => {
  const o = check(line('469363', 2, 'l', { claims: ['VEGAN'], avoidAllergens: ['AM'] }));
  assert.ok(o.blocks.includes('missing_claim:VEGAN')); assert.ok(o.blocks.includes('allergen:AM')); assert.equal(o.commitAllowed, false);
});
test('compatible quantities round together, conflicting origins retain independent packs and share stock', () => {
  const ls = recomputeLines([line('464856', .8, 'kg'), line('464856', .8, 'kg', { lineId: 'L002' })], sources);
  assert.equal(sharedStock(ls)[0].minimumSalesUnitsNeeded, 1);
  ls[0].origin = 'fi'; ls[1].origin = 'no';
  assert.equal(sharedStock(ls)[0].minimumSalesUnitsNeeded, 2); assert.equal(sharedStock(ls)[0].mustNotDoubleCountStock, true);
});
const state = (number, category = 'conversation') => {
  const row = { caseId: `synthetic-${String(number).padStart(4, '0')}`, primaryCategory: category, expected: { transport: 'synthetic_transport' } };
  const ls = recomputeLines([line('469363', 2, 'l')], sources);
  return stateScenario(row, ls, l => recomputeLines(l, sources));
};
test('positive confirmation mutates basket once; cancellation and scope switches revoke pending authority', () => {
  const success = state(1).stateContract;
  assert.equal(success.turns[0].after.baskets.Darragh.length, 0);
  assert.equal(success.final.baskets.Darragh.length, 1); assert.equal(success.final.orderCount, 0);
  assert.deepEqual(state(2).stateContract.final.baskets, { Darragh: [], Pavit: [], Conference: [] });
  const switched = state(3).stateContract;
  assert.equal(switched.turns[1].after.selectedScope, 'Darragh'); assert.equal(switched.turns[1].after.pending, null);
  assert.deepEqual(switched.final.baskets, { Darragh: [], Pavit: [], Conference: [] });
});
test('replacement preview specifies final quantities and checkout requires two order confirmations', () => {
  const correction = state(4).stateContract;
  assert.equal(correction.final.baskets.Darragh[0].requestedAmount, 4);
  assert.equal(correction.final.baskets.Darragh[0].salesUnits, 4);
  const purchase = state(6).stateContract;
  assert.equal(purchase.turns[2].after.orderCount, 0); assert.equal(purchase.final.orderCount, 1);
  assert.equal(purchase.final.approvalCount, 0); assert.equal(purchase.final.receipts[0].totalExVat, 4.96);
});
test('transport retries never restore old previews and reconnect preserves baskets but resets selection', () => {
  const replay = state(1, 'transport').stateContract;
  assert.deepEqual(replay.replay.map(x => x.expectedHttp), [200, 409]);
  const reconnect = state(2, 'transport').stateContract;
  assert.equal(reconnect.final.selectedScope, null); assert.equal(reconnect.final.baskets.Darragh.length, 1);
  const older = state(3, 'transport').stateContract;
  assert.equal(older.final.pending.scope, 'Pavit'); assert.equal(older.replay[0].mustReturnCurrentSession, true);
});
test('baseline audit finds quantity/constraint loss without reusing observed output as expectations', () => {
  const frozen = { caseId: 'synthetic', input: '2 l milk 469363 lactose-free', split: 'development', primaryCategory: 'ordinary', expected: { lines: [line('469363', 2, 'l', { claims: ['FREE_FROM_LACTOSE'] })] } };
  const original = structuredClone(frozen);
  const audit = auditBaseline([{ caseId: 'synthetic', input: frozen.input, channel: 'main', modelMode: 'model-disabled', status: 200,
    response: { request: { lines: [{ productId: '469363', quantity: { amount: 1, unit: 'l' }, constraints: { claims: [] } }] } } }], [frozen]);
  const g = audit.groups['model-disabled:main'];
  assert.equal(g.quantityDifferences, 1); assert.equal(g.lostRequiredClaims, 1); assert.deepEqual(frozen, original);
});
test('default reader cannot open holdout: validation works with no holdout file present and detects tampering', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'corpus-v3-reader-'));
  try {
    const rows = Array.from({ length: 800 }, (_, i) => ({ scenarioId: `dev-${i}`, caseId: `dev-${i}`, split: 'development', primaryCategory: 'ordinary', itemCount: 1, input: String(i), expected: {} }));
    const files = { 'development.jsonl': jsonl(rows), 'commitments.jsonl': jsonl(rows.map(commitmentFor)) };
    for (const [n, bytes] of Object.entries(files)) writeFileSync(resolve(dir, n), bytes);
    writeFileSync(resolve(dir, 'checksums.json'), JSON.stringify({ version: 3, campaignId: 'api-quality-20261115-c8a4', clock, files: Object.fromEntries(Object.entries(files).map(([n, b]) => [n, { sha256: sha256(b) }])) }));
    assert.equal(existsSync(resolve(dir, 'holdout.jsonl')), false);
    assert.equal(loadRevision({ corpusDir: dir, commitmentsPath: resolve(dir, 'commitments.jsonl') }).rows.length, 800);
    writeFileSync(resolve(dir, 'development.jsonl'), jsonl(rows).replace('dev-0', 'altered'));
    assert.throws(() => loadRevision({ corpusDir: dir, commitmentsPath: resolve(dir, 'commitments.jsonl') }), /checksum/);
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('corpus-v3-reader-'));
    rmSync(dir, { recursive: true });
  }
});
