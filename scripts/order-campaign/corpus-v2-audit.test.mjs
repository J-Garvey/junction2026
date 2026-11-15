import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute, basename } from 'node:path';
import { auditRows, catalogConversion, independentSignature, readVerifiedCorpus } from './corpus-v2-audit.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
const product = { id: '123456', en: 'Brand cheesecake 1600 g', brand: 'Brand', bu: 'ST', units: { ST: 1 }, net_kg: 1.6, net_src: 'synkka' };
const line = { lineId: 'L001', productId: '123456', product: product.en, amount: 40000, unit: 'g', claims: [], avoidAllergens: [], fixtureOracle: { packs: 26, totalEur: 653.9, blocks: [], questions: [], unknowns: [] } };
const stock = { scheduleLines: [{ salesUnit: 'ST' }] };
const fixture = { availability: { '123456': stock }, price: { '123456': { catalogPrice: { value: 25.15 }, comparisonPrice: { value: 15.72 }, comparisonUnit: 'KG' } } };
const catalog = new Map([[product.id, product]]);
const row = extras => ({ scenarioId: 'development-example', split: 'development', primaryCategory: 'ordinary', input: 'Order 40000 g [Aimo ID 123456]', expected: { lines: [structuredClone(line)] }, ...extras });

test('manufacturer pack arithmetic avoids rounding a comparison price into an extra pack', () => {
  assert.deepEqual(catalogConversion(line, product, stock), { packSize: 1.6, packs: 25, evidence: 'manufacturer_mass' });
  const report = auditRows([row()], catalog, fixture);
  assert.equal(report.arithmetic.manufacturerOrBaseUnitDisagreements, 1);
  assert.equal(report.arithmetic.roundingConsistentManufacturerOrBaseUnitDisagreements, 1);
  assert.equal(report.developmentExamples.arithmetic[0].catalogTotalEur, 628.75);
});

test('conflicting source data stays separate from a corroborated rounding error', () => {
  const conflicting = structuredClone(fixture);
  conflicting.price['123456'].comparisonPrice.value = 2;
  const report = auditRows([row()], catalog, conflicting);
  assert.equal(report.arithmetic.sourceConflictOrVariableWeightDisagreements, 1);
  assert.equal(report.arithmetic.roundingConsistentManufacturerOrBaseUnitDisagreements, 0);
  assert.deepEqual(report.developmentExamples.arithmetic, []);
});

test('uses the returned sales unit; missing conversions and cross-dimension requests stay unknown', () => {
  assert.equal(catalogConversion(line, undefined, undefined), null);
  assert.equal(catalogConversion(line, product, { scheduleLines: [{ salesUnit: 'UNKNOWN' }] }), null);
  assert.equal(catalogConversion({ ...line, unit: 'l' }, product, stock), null);
  const p = { ...product, units: { KI: 5 } };
  assert.equal(catalogConversion(line, p, { scheduleLines: [{ salesUnit: 'KI' }] }).packs, 5);
  assert.equal(catalogConversion({ ...line, amount: null }, product, stock), null);
});

test('inferred metadata conflicts do not become manufacturer-backed discrepancies', () => {
  const report = auditRows([row()], new Map([[product.id, { ...product, net_src: 'name' }]]), fixture);
  assert.equal(report.arithmetic.inferredMetadataDisagreements, 1);
  assert.equal(report.arithmetic.manufacturerOrBaseUnitDisagreements, 0);
  assert.deepEqual(report.developmentExamples.arithmetic, []);
});

test('collision challenge removes brand, punctuation, numeric packs and quantities while retaining diet', () => {
  const other = { ...product, id: '234567', brand: 'Other', en: 'Other cheesecake, 800 g!' };
  const c = new Map([...catalog, [other.id, other]]);
  const a = row(), b = row();
  b.expected.lines[0] = { ...line, productId: other.id, amount: 10, product: other.en };
  assert.equal(independentSignature(a, c), independentSignature(b, c));
  b.expected.lines[0].claims = ['VEGAN'];
  assert.notEqual(independentSignature(a, c), independentSignature(b, c));
});

test('conversation audit exposes family labels and absent final state without inferring a purchase', () => {
  const r = row({ primaryCategory: 'conversation', sequence: ['add request', 'show Other', 'confirm change'] });
  r.expected.turns = [{ operation: 'preview', confirmed: false }, { operation: 'scope_switch', confirmed: false }, { operation: 'scope_switch', confirmed: false }];
  const s = auditRows([r], catalog, fixture).state;
  assert.equal(s.actualTurnLabelMismatches, 1);
  assert.equal(s.withoutExplicitFinalState, 1);
  assert.equal(s.allTurnsUnconfirmed, 1);
});

test('aggregate output never emits holdout example IDs or expected values', () => {
  const secretId = 'auditor-private-id';
  const r = row({ scenarioId: secretId, split: 'holdout', primaryCategory: 'conversation', sequence: ['add', 'confirm change'] });
  const result = auditRows([r], catalog, fixture);
  assert.equal(result.arithmetic.manufacturerOrBaseUnitDisagreements, 1);
  assert.ok(!JSON.stringify(result).includes(secretId));
  assert.deepEqual(result.developmentExamples, { arithmetic: [], state: [] });
});

function removeOwnedTemp(dir) {
  const target = resolve(dir), rel = relative(resolve(tmpdir()), target);
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel) && basename(target).startsWith('a1-audit-'));
  rmSync(target, { recursive: true, force: true });
}

test('default verified loading works with no full/holdout files and rejects a changed public anchor', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'a1-audit-'));
  try {
    const r = row(), text = JSON.stringify(r) + '\n';
    const commitments = JSON.stringify({ scenarioId: r.scenarioId, primaryCategory: r.primaryCategory, itemCount: r.itemCount, split: r.split, contentHash: hash(JSON.stringify(r)) }) + '\n';
    const files = { 'development.jsonl': text, 'commitments.jsonl': commitments };
    for (const [name, bytes] of Object.entries(files)) writeFileSync(resolve(dir, name), bytes);
    writeFileSync(resolve(dir, 'anchor.jsonl'), commitments);
    writeFileSync(resolve(dir, 'checksums.json'), JSON.stringify({ campaignId: 'api-quality-20261115-c8a4', clock: '2026-11-14T10:00:00Z', files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { sha256: hash(bytes) }])) }));
    assert.equal(readVerifiedCorpus({ corpusDir: dir, commitmentsPath: resolve(dir, 'anchor.jsonl') }).rows.length, 1);
    assert.throws(() => readVerifiedCorpus({ corpusDir: dir, includeHoldout: true }), /ENOENT/);
    writeFileSync(resolve(dir, 'anchor.jsonl'), '{}\n');
    assert.throws(() => readVerifiedCorpus({ corpusDir: dir, commitmentsPath: resolve(dir, 'anchor.jsonl') }), /Published commitments mismatch/);
    writeFileSync(resolve(dir, 'development.jsonl'), text + text);
    assert.throws(() => readVerifiedCorpus({ corpusDir: dir }), /Checksum mismatch/);
  } finally { removeOwnedTemp(dir); }
});
