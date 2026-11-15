import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, relative, isAbsolute, basename } from 'node:path';
import { buildCampaignCorpus, campaignId, categoryCounts, clock, commitmentFor, freezeCampaignCorpus, oracleForLine, semanticSignature, sha256, validateCorpus } from './corpus-v2.mjs';

const line = (extras = {}) => ({ lineId: 'L001', productId: '123456', product: 'Independent test item', amount: 2.25, unit: 'l', claims: [], avoidAllergens: [], ...extras });
const product = { id: '123456', claims: ['FREE_FROM_LACTOSE'], contains: ['AM'], may_contain: [], free_from: ['AN'], has_allergen_data: true, origin: 'fi', units: { KI: 6 }, bu: 'ST' };
const price = { error: false, catalogPrice: { value: 3 }, comparisonPrice: { value: 2 }, comparisonUnit: 'L' };
const stock = { logisticModel: 'Stock', closingTime: '2026-11-15T10:00:00Z', salesBlock: false, scheduleLines: [{ availableAmount: 1, availableDate: '2026-11-16', salesUnit: 'KI', salesBlock: false }] };
const oracle = (l = line(), p = product, pr = price, a = stock) => oracleForLine(l, p, pr, a);
function removeOwnedTemporaryDirectory(dir) {
  const target = resolve(dir), withinTemp = relative(resolve(tmpdir()), target);
  assert.ok(withinTemp && !withinTemp.startsWith('..') && !isAbsolute(withinTemp) && basename(target).startsWith('aq2-'));
  rmSync(target, { recursive: true, force: true });
}

test('independent hand arithmetic uses fixed ex-VAT price and whole sales units', () => {
  const result = oracle();
  assert.equal(result.packSize, 1.5);
  assert.equal(result.packs, 2);
  assert.equal(result.totalEur, 6);
  assert.ok(result.questions.includes('partial_fill'));
});
test('lactose-free never waives the milk allergen', () => {
  const result = oracle(line({ claims: ['FREE_FROM_LACTOSE'], avoidAllergens: ['AM'] }));
  assert.deepEqual(result.blocks, ['allergen:AM']);
});
test('missing and undeclared allergen evidence cannot establish free-from safety', () => {
  assert.ok(oracle(line({ avoidAllergens: ['AE'] })).blocks.includes('allergen_safety_unproven:AE'));
  assert.ok(oracle(line({ avoidAllergens: ['AN'] }), { ...product, free_from: [], allergen_undeclared: ['AN'] }).blocks.includes('allergen_safety_unproven:AN'));
});
test('terminal and scaled stock sentinels stay unknown', () => {
  for (const availability of [
    { ...stock, logisticModel: 'Terminal', scheduleLines: [{ ...stock.scheduleLines[0], availableAmount: 999999 }] },
    { ...stock, scheduleLines: [{ ...stock.scheduleLines[0], availableAmount: 9999999999 / 6 }] },
  ]) {
    const result = oracle(line(), product, price, availability);
    assert.equal(result.stock, 'unknown');
    assert.equal(result.availableSalesUnits, null);
    assert.ok(result.questions.includes('builder_continue_unknown_stock'));
  }
});
test('expired cutoff, missing delivery and price error are independent hard failures', () => {
  const result = oracle(line(), product, { error: true }, { ...stock, closingTime: '2026-11-13T10:00:00Z', scheduleLines: [] });
  assert.deepEqual(result.blocks.sort(), ['expired_cutoff', 'no_delivery_date', 'price_unavailable']);
});
test('density is never invented when mass and volume dimensions differ', () => {
  const result = oracle(line({ unit: 'kg' }));
  assert.equal(result.packs, undefined);
  assert.ok(result.unknowns.includes('pack_conversion_unverified'));
});
test('semantic uniqueness ignores wording, quantities, order, category and channel', () => {
  const a = { input: 'one wording', channel: 'main', expected: { lines: [line(), line({ productId: '234567' })] } };
  const b = { input: 'different wording', channel: 'whatsapp', primaryCategory: 'ordinary', expected: { lines: [line({ productId: '234567', amount: 100 }), line({ lineId: 'other', amount: 999 })] } };
  assert.equal(semanticSignature(a), semanticSignature(b));
  b.expected.lines[0].claims = ['VEGAN'];
  assert.notEqual(semanticSignature(a), semanticSignature(b));
});
test('semantic signature retains conversation operations and duplicate multiplicity', () => {
  const a = { expected: { lines: [line()], turns: [{ operation: 'cancel', scope: 'Darragh' }] } };
  const b = structuredClone(a); b.expected.turns[0].operation = 'confirm';
  assert.notEqual(semanticSignature(a), semanticSignature(b));
  b.expected = { ...a.expected, lines: [line(), line()] };
  assert.notEqual(semanticSignature(a), semanticSignature(b));
});

function syntheticRows() {
  const rows = [];
  for (const [category, count] of Object.entries(categoryCounts)) for (let i = 0; i < count; i++) {
    const caseId = `unit-${category}-${i}`, id = String(600000 + rows.length);
    const countItems = category === 'long' ? 100 : 1;
    const lines = Array.from({ length: countItems }, (_, j) => line({ lineId: `L${j}`, productId: id, neighbor: { lineId: `L${(j + 1) % countItems}` } }));
    rows.push({ caseId, scenarioId: caseId, primaryCategory: category, itemCount: lines.length, input: `${caseId} ${id}`, expected: { lines }, channel: 'main', channels: ['main', 'whatsapp'], plan: true, split: i < count / 5 ? 'holdout' : 'development', evidence: { source: 'unit test only' } });
  }
  return rows;
}
test('validator enforces exact strata, semantic uniqueness and neighbor references', () => {
  const rows = syntheticRows();
  assert.equal(validateCorpus(rows).scenarios, 1000);
  rows[0].split = 'development';
  assert.throws(() => validateCorpus(rows), /split_count/);
  rows[0].split = 'holdout';
  rows[250].expected.lines[0].neighbor.lineId = 'missing';
  assert.throws(() => validateCorpus(rows), /long_item_or_neighbor_missing/);
});

function fakeFreeze(dir) {
  const rows = syntheticRows(), development = rows.filter(r => r.split === 'development');
  const encode = values => values.map(r => JSON.stringify(r)).join('\n') + '\n';
  const files = { 'development.jsonl': encode(development), 'commitments.jsonl': encode(rows.map(commitmentFor)) };
  for (const [name, content] of Object.entries(files)) writeFileSync(resolve(dir, name), content);
  // Deliberately unreadable JSON proves default access doesn't parse this file.
  writeFileSync(resolve(dir, 'holdout.jsonl'), 'DO NOT READ SEALED HOLDOUT');
  const manifest = { campaignId, clock, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { sha256: sha256(content) }])) };
  writeFileSync(resolve(dir, 'checksums.json'), JSON.stringify(manifest));
  const commitmentsPath = resolve(dir, 'published.commitments.jsonl');
  writeFileSync(commitmentsPath, files['commitments.jsonl']);
  return { corpusDir: dir, commitmentsPath };
}
test('default loader returns development800 without opening holdout or full corpus', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'aq2-loader-'));
  try {
    const options = fakeFreeze(dir);
    assert.equal(buildCampaignCorpus(options).length, 800);
    assert.throws(() => buildCampaignCorpus({ ...options, includeHoldout: true }));
    writeFileSync(resolve(dir, 'development.jsonl'), '\n', { flag: 'a' });
    assert.throws(() => buildCampaignCorpus(options), /checksum mismatch/);
  } finally { removeOwnedTemporaryDirectory(dir); }
});
test('published commitments anchor a freeze against rewritten local checksum metadata', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'aq2-anchor-'));
  try {
    const options = fakeFreeze(dir);
    writeFileSync(options.commitmentsPath, '[]\n');
    assert.throws(() => buildCampaignCorpus(options), /Published commitments/);
  } finally { removeOwnedTemporaryDirectory(dir); }
});
test('Windows Git CRLF checkout preserves the published commitment anchor', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'aq2-crlf-'));
  try {
    const options = fakeFreeze(dir);
    writeFileSync(options.commitmentsPath, readFileSync(options.commitmentsPath, 'utf8').replaceAll('\n', '\r\n'));
    assert.equal(buildCampaignCorpus(options).length, 800);
  } finally { removeOwnedTemporaryDirectory(dir); }
});
test('freeze refuses occupied paths and in-repository full corpus paths', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'aq2-exclusive-'));
  try {
    writeFileSync(resolve(dir, 'attempt.txt'), 'preserve');
    assert.throws(() => freezeCampaignCorpus({ corpusDir: dir }), /already exists/);
    assert.equal(readFileSync(resolve(dir, 'attempt.txt'), 'utf8'), 'preserve');
    assert.throws(() => freezeCampaignCorpus({ corpusDir: resolve('scripts/order-campaign/disallowed-full-corpus') }), /outside Git/);
  } finally { removeOwnedTemporaryDirectory(dir); }
});
test('committed manifest contains only compact commitments and exact category strata', () => {
  const rows = readFileSync(new URL('./corpus-v2.commitments.jsonl', import.meta.url), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 1000);
  for (const r of rows) {
    assert.deepEqual(Object.keys(r).sort(), ['contentHash', 'itemCount', 'primaryCategory', 'scenarioId', 'semanticHash', 'split']);
    assert.match(r.contentHash, /^[a-f0-9]{64}$/);
  }
  assert.equal(new Set(rows.map(r => r.semanticHash)).size, 1000);
  for (const [category, count] of Object.entries(categoryCounts)) {
    assert.equal(rows.filter(r => r.primaryCategory === category).length, count);
    assert.equal(rows.filter(r => r.primaryCategory === category && r.split === 'holdout').length, count / 5);
  }
});
