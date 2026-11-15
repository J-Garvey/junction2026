/** Auditor-only v2 -> v3 revision. Keeps frozen originals and split membership. */
import { createHash, randomInt } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { clock, normalize, oracleForLine, packFact, sharedStock, money } from './corpus-v3-oracle.mjs';
import { stateScenario } from './corpus-v3-state.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const campaignId = 'api-quality-20261115-c8a4';
export const artifactRoot = `C:/Users/benfh/junction-trials/${campaignId}`;
export const categoryCounts = { ordinary: 250, long: 200, conversation: 150, boundary: 150, linguistic: 100, resilience: 100, transport: 50 };
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
export const readRows = path => readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const hashObject = o => sha256(JSON.stringify(o));
const pick = xs => xs[randomInt(xs.length)];
const rawLine = l => {
  const result = { ...l }; delete result.fixtureOracle; delete result.neighbor; delete result.selection;
  return result;
};
const restrictionText = l => [
  ...l.claims.map(c => ({ VEGAN: 'vegan', FREE_FROM_LACTOSE: 'lactose-free', FREE_FROM_GLUTEN: 'gluten-free' })[c] || c),
  ...l.avoidAllergens.map(a => `free from ${{ AM: 'milk', AN: 'tree nuts', AP: 'peanuts', AE: 'eggs', AF: 'fish', AY: 'soybeans' }[a] || a}`),
  ...(l.origin ? [`origin ${l.origin === 'fi' ? 'Finland' : l.origin === 'no' ? 'Norway' : l.origin}`] : []),
].join(' and ') || 'no additional dietary or origin requirement';
const phrase = (l, nameOnly = false) => `${l.amount} ${l.unit} ${l.product}${nameOnly ? '' : ` [Aimo ID ${l.productId}]`}, requirements: ${restrictionText(l)}`;
const policy = { siteId: 'site-aurora', spendCapEur: 1950, wholeSalesUnits: true, dietaryRulesNeverWaived: true, unknownStockNeverConfirmed: true,
  approvalBoundToSiteItemsQuantitiesTotalAndDelivery: true, recheckAtCommit: true, overshootMaxPct: 10, overshootMaxEur: 25 };

export function loadSources(root = repo) {
  const products = readRows(resolve(root, 'data/products_slim.jsonl'));
  const fixture = JSON.parse(readFileSync(resolve(root, 'data/fixtures/aimo/base.json'), 'utf8'));
  return { products, catalog: new Map(products.map(p => [p.id, p])), fixture };
}
export function recomputeLines(lines, sources, neededBy = '2026-11-16') {
  return lines.map(l => ({ ...rawLine(l), ...(l.neighbor ? { neighbor: l.neighbor } : {}),
    selection: l.selection || { mode: 'exact_sku', acceptedProductIds: [l.productId], substitution: 'ask_chef_before_different_ingredient' },
    fixtureOracle: oracleForLine(l, sources.catalog.get(l.productId), sources.fixture.price[l.productId], sources.fixture.availability[l.productId], neededBy) }));
}
function viablePool(sources) {
  const pool = [];
  const nameCounts = new Map();
  for (const p of sources.products) nameCounts.set(p.en?.toLowerCase(), (nameCounts.get(p.en?.toLowerCase()) || 0) + 1);
  for (const p of sources.products) {
    if (!p.en || nameCounts.get(p.en.toLowerCase()) !== 1 || !p.hotel_tags?.some(t => ['breakfast', 'banquet', 'room_service'].includes(t))) continue;
    const price = sources.fixture.price[p.id], availability = sources.fixture.availability[p.id];
    const unit = p.net_l && p.net_src === 'synkka' ? 'l' : p.net_kg ? 'kg' : 'pcs';
    const fact = packFact(p, price, availability, normalize({ amount: 1, unit }).normalizedUnit);
    if (fact.status !== 'verified') continue;
    const line = { productId: p.id, product: p.en, amount: fact.packSize, unit, claims: [], avoidAllergens: [] };
    const o = oracleForLine(line, p, price, availability);
    // Leave headroom for corrections and duplicate-stock cases. Avoid costly implied approvals.
    if (o.commitAllowed && o.availableSalesUnits >= 8 && o.totalEur > 0 && o.totalEur <= 75 && !p.var_weight) pool.push(line);
  }
  if (pool.length < 40) throw Error(`Too few independently supported viable hotel products: ${pool.length}`);
  return pool;
}
function realisticLines(count, pool, sources, index) {
  const selected = [], seen = new Set();
  while (selected.length < count) {
    const base = pick(pool); if (seen.has(base.productId)) continue; seen.add(base.productId);
    const p = sources.catalog.get(base.productId), i = selected.length;
    // Requirements follow a real product claim rather than a random incompatible diet.
    const supported = ['FREE_FROM_LACTOSE', 'FREE_FROM_GLUTEN', 'VEGAN'].filter(c => p.claims?.includes(c));
    const claims = supported.length && (index + i) % 3 === 0 ? [supported[(index + i) % supported.length]] : [];
    selected.push({ ...base, lineId: `L${String(i + 1).padStart(3, '0')}`, amount: Number((base.amount * (1 + index % 3)).toFixed(8)), claims });
  }
  return selected;
}
function ordinaryRevision(row, pool, sources, index) {
  const serviceMode = index % 5;
  const servicePool = pool.filter(l => {
    const tags = sources.catalog.get(l.productId).hotel_tags || [];
    if (serviceMode === 0) return tags.includes('breakfast');
    if (serviceMode === 1) return tags.some(t => /:(?:coffee_and_tea|coffee_milk|milk|bread|pastries|croissants|desserts)$/.test(t));
    return tags.includes(serviceMode === 3 ? 'room_service' : 'banquet');
  });
  // A repeated approved pair alone is one meaning; add another real hotel need
  // rather than create apparent uniqueness by changing only its requested amount.
  const lineCount = Math.max(serviceMode === 4 ? 2 : 1, 1 + Math.floor(index / 5) % 5);
  const lines = realisticLines(lineCount, servicePool, sources, index);
  const nameOnly = index % 5 < 2;
  for (const l of lines) l.selection = { mode: nameOnly ? 'unique_catalog_name' : 'exact_sku', acceptedProductIds: [l.productId], substitution: 'ask_chef_before_different_ingredient' };
  let equivalence = null;
  if (index % 5 === 4) {
    const pairs = [];
    const byId = new Map(servicePool.map(p => [p.productId, p]));
    for (const p of servicePool) for (const id of sources.catalog.get(p.productId).subs || []) {
      const other = byId.get(id);
      if (other && p.unit === other.unit) pairs.push([p, other]);
    }
    if (pairs.length) {
      const [a, b] = pick(pairs);
      lines[0] = { ...a, lineId: 'L001', claims: [], avoidAllergens: [], selection: { mode: 'buyer_approved_equivalents', acceptedProductIds: [a.productId, b.productId],
        basis: 'catalog_listed_substitute_plus_explicit_chef_permission_in_this_request', ingredientEquivalenceInferredFromCategory: false,
        alternatives: [a, b].map(l => ({ productId: l.productId, fixtureOracle: oracleForLine({ ...l, amount: a.amount }, sources.catalog.get(l.productId), sources.fixture.price[l.productId], sources.fixture.availability[l.productId]) })) } };
      equivalence = b;
    }
  }
  const service = ['breakfast restock', 'conference coffee service', 'banquet preparation', 'room-service restock', 'late conference amendment'][index % 5];
  const permission = equivalence ? ` I am the chef: for the first line I explicitly accept either ${lines[0].product} [Aimo ID ${lines[0].productId}] or the catalog-listed substitute ${equivalence.product} [Aimo ID ${equivalence.productId}] in this recipe. Choose an accepted option that meets the stated quantity, price and confirmed stock; ask before any other ingredient substitution.` : ' Preserve the requested products; ask me before substituting an ingredient.';
  return { lines, input: `For ${service}, please prepare ${lines.map(l => phrase(l, nameOnly)).join('; ')}. Delivery 2026-11-16 to site-aurora.${permission} Review before purchase.`,
    expected: { issue: nameOnly ? 'realistic_name_only' : equivalence ? 'explicit_chef_approved_equivalent_set' : 'realistic_exact_product', nameOnly, hotelService: service, globalRules: null, requestedProductMatching: 'per_line_selection_contract', noAutomaticPurchaseFromText: true } };
}
function longRevision(row, pool, sources) {
  const count = Math.max(30, Math.min(100, row.expected.lines.length));
  const lines = row.expected.lines.slice(0, count).map(rawLine);
  while (lines.length < count) {
    const l = { ...pick(pool), lineId: `L${String(lines.length + 1).padStart(3, '0')}`, claims: [], avoidAllergens: [] };
    lines.push(l);
  }
  // Reassert both repeats explicitly in every long input, including former 20-item cases.
  lines[10] = { ...structuredClone(lines[9]), lineId: 'L011', amount: lines[9].amount * 2 };
  lines[25].origin = 'fi';
  lines[26] = { ...structuredClone(lines[25]), lineId: 'L027', amount: lines[25].amount * 2, origin: 'no' };
  for (const [i, l] of lines.entries()) l.neighbor = { lineId: lines[(i + 1) % count].lineId, preserveIndependentRequirements: true, mustNotCopyQuantity: true };
  const c = { lineId: 'L004', kind: 'replace_quantity', previousAmount: lines[3].amount * 3, finalAmount: lines[3].amount, unit: lines[3].unit, correctionLocation: 'after_last_item' };
  const prose = row.tags?.includes('prose');
  const body = lines.map((l, i) => {
    const draft = i === 3 ? { ...l, amount: c.previousAmount } : l;
    return prose ? `For position ${l.lineId}, the kitchen needs ${phrase(draft)}. The next position ${l.neighbor.lineId} keeps its own amount and restrictions.`
      : `${l.lineId}: ${phrase(draft)}. Neighbor ${l.neighbor.lineId} has independent quantity and requirements.`;
  }).join('\n');
  const global = row.expected.globalRules;
  return { lines, input: `Conference banquet revision: exactly ${count} requested positions. ${global?.claims?.includes('FREE_FROM_GLUTEN') ? 'Every position must be gluten-free. ' : ''}Keep each position's local requirements.\n${body}\nLate correction to the early item ${c.lineId}: replace its earlier ${c.previousAmount} ${c.unit} with ${c.finalAmount} ${c.unit}; do not add them.\nDeliver 2026-11-16 to site-aurora. Merge compatible repeats, retain incompatible positions, and share supplier stock across all positions. Ask before partial fulfillment or purchase.`,
    expected: { ...row.expected, corrections: [c], expectedPositions: count, duplicatePairs: [ { lineIds: ['L010', 'L011'], compatible: true }, { lineIds: ['L026', 'L027'], compatible: false, conflict: 'origin_fi_versus_no' } ] } };
}

export function reviseRows(original, sources) {
  const pool = viablePool(sources);
  const seen = new Set(), semantic = new Set();
  const rows = original.map((source, index) => {
    for (let attempt = 0; attempt < 200; attempt++) {
    const row = structuredClone(source), category = row.primaryCategory;
    let revision;
    if (category === 'ordinary') revision = ordinaryRevision(row, pool, sources, Number(row.caseId.slice(-4)) - 1);
    else if (category === 'long') revision = longRevision(row, pool, sources);
    else if (['conversation', 'transport'].includes(category)) {
      const ls = recomputeLines(realisticLines(1 + index % 3, pool, sources, index), sources);
      const s = stateScenario(row, ls, lines => recomputeLines(lines, sources));
      revision = { lines: s.lines, input: s.sequence[0], expected: { issue: s.stateContract.issue, stateContract: s.stateContract, turns: s.stateContract.turns, operation: 'explicit_state_contract', noDuplicateOrders: true, noMutationBeforeValidConfirmation: true, retainDietRules: true } };
      row.sequence = s.sequence; row.scenario = s.scenario; delete row.special;
      if (s.special) row.special = s.special;
      row.channels = ['whatsapp'];
    } else revision = { lines: row.expected.lines.map(rawLine), input: row.input, expected: { ...row.expected } };
    row.input = revision.input;
    const expected = { ...revision.expected };
    delete expected.lines; delete expected.sharedStock;
    // Replaced state contracts must not inherit v2's family-as-operation/all-unconfirmed fields.
    row.expected = { oracle: 'A2 v3: manufacturer pack facts corroborated within half a cent by saved API prices; independent pre-execution policy/state contracts', neededBy: '2026-11-16',
      ...expected, policy, noSilentLineLoss: true, noAutomaticPurchaseFromText: true };
    row.expected.lines = recomputeLines(revision.lines, sources, row.expected.neededBy);
    row.expected.lineCount = row.expected.lines.length;
    row.expected.sharedStock = sharedStock(row.expected.lines);
    row.itemCount = row.expected.lines.length;
    row.expected.dateAndPriceGuards = { missingOrInvalidDeliveryDate: 'block_no_confirmed_delivery', requestedDateMissing: 'clarify', requestedDateInvalidOrPast: 'block',
      returnedDateDifferent: 'ask_accept_new_date_before_commit', priceError: 'block', priceValidityMissing: 'unknown_no_fixed_price_commit', priceNotValidAtCommitOrDelivery: 'ask_requote_no_commit_at_expired_price' };
    row.revision = { version: 3, originalContentHash: hashObject(source), originalInputHash: hashObject({ input: source.input, sequence: source.sequence ?? null }),
      reasons: [ 'A1-001_verified_or_unknown_conversion', 'A1-005_date_price_guards', ...(category === 'long' ? ['A1-003_30_to_100_all_repeat_pairs_and_late_early_item_correction'] : []), ...(category === 'ordinary' ? ['A1-004_viable_name_exact_and_explicit_equivalent'] : []), ...(['conversation', 'transport'].includes(category) ? ['A1-002_complete_state_contract'] : []) ] };
    row.evidence = { ...row.evidence, type: 'fixture_and_policy', clock, productionResponseInspected: false, revisionAuthor: 'A2', independentlyReviewed: false };
    if (category === 'long') row.tags = [...new Set([...(row.tags || []).filter(t => t !== 'exactly_100'), ...(row.itemCount === 100 ? ['exactly_100'] : []), 'late_correction_to_early_item'])];
    const textIdentity = hashObject({ input: row.input, sequence: row.sequence ?? null }), meaning = semanticSignature(row, sources);
    if (!seen.has(textIdentity) && !semantic.has(meaning)) { seen.add(textIdentity); semantic.add(meaning); return row; }
    if (!['ordinary', 'conversation', 'transport'].includes(category)) throw Error('Unchanged v2 inputs collide semantically after revision');
    }
    throw Error('Unable to author unique source-supported scenario');
  });
  return { rows, viablePoolSize: pool.length };
}

/** Quantity/brand/format/scope spelling does not create semantic uniqueness. */
export function semanticSignature(row, sources) {
  const meaning = (id, name = '') => {
    const p = sources?.catalog.get(id);
    let text = (p?.en || name).normalize('NFKC').toLowerCase();
    if (p?.brand?.trim()) text = text.replaceAll(p.brand.trim().toLowerCase(), ' ');
    return text.replace(/\d+(?:[.,]\d+)?/g, ' ').replace(/\b(?:kg|g|ml|cl|dl|l|pcs|pc|pieces|x)\b/g, ' ').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  };
  return hashObject({ lines: row.expected.lines.map(l => ({ product: meaning(l.productId, l.product), claims: [...l.claims].sort(), avoid: [...l.avoidAllergens].sort(), origin: l.origin ?? null, selection: l.selection?.mode ?? 'exact_sku',
    accepted: [...(l.selection?.acceptedProductIds || [l.productId])].map(id => meaning(id, l.product)).sort() }))
    .map(JSON.stringify).sort(), issue: row.expected.issue ?? null, global: row.expected.globalRules ?? null, unsupported: row.expected.unsupportedCriteria ?? null,
    state: row.expected.stateContract?.turns.map(t => ({ intent: t.intent, outcome: t.outcome })), transport: row.expected.stateContract?.replay.map(r => r.action) });
}

export function validateCorpus(rows, original, sources = loadSources()) {
  const fail = message => { throw Error(`v3 validation: ${message}`); };
  if (rows.length !== 1000 || new Set(rows.map(r => r.caseId)).size !== 1000) fail('1000 unique stable IDs required');
  const previous = original && new Map(original.map(r => [r.caseId, r]));
  const texts = new Set(), meanings = new Set();
  for (const [category, n] of Object.entries(categoryCounts)) {
    const group = rows.filter(r => r.primaryCategory === category);
    if (group.length !== n || group.filter(r => r.split === 'holdout').length !== n / 5) fail(`category/split ${category}`);
  }
  let exact100 = 0, nameOnly = 0, ordinaryClear = 0, equivalent = 0;
  for (const r of rows) {
    const old = previous?.get(r.caseId);
    if (previous && (!old || old.split !== r.split || old.primaryCategory !== r.primaryCategory || old.scenarioId !== r.scenarioId)) fail('changed identity/category/split');
    const textIdentity = JSON.stringify({ input: r.input, sequence: r.sequence ?? null });
    if (!r.input || texts.has(textIdentity)) fail('duplicate/empty input sequence'); texts.add(textIdentity);
    const meaning = semanticSignature(r, sources);
    if (meanings.has(meaning)) fail('duplicate semantics'); meanings.add(meaning);
    if (r.expected.lines.length !== r.itemCount || r.expected.lineCount !== r.itemCount) fail('line count');
    for (const l of r.expected.lines) if (!l.selection || !l.fixtureOracle || l.fixtureOracle.commitAllowed && (l.fixtureOracle.packs === null || l.fixtureOracle.totalEur === null)) fail('incomplete line contract');
    if (r.primaryCategory === 'long') {
      if (r.itemCount < 30 || r.itemCount > 100) fail('long outside 30..100');
      if (new Set(r.expected.lines.map(l => l.lineId)).size !== r.itemCount) fail('long IDs');
      if (r.itemCount === 100) exact100++;
      const c = r.expected.corrections?.[0];
      if (!c || c.lineId !== 'L004' || c.correctionLocation !== 'after_last_item' || !r.input.includes(`with ${c.finalAmount} ${c.unit}; do not add them`)) fail('missing late early-item correction');
      const ls = r.expected.lines;
      if (ls[9].productId !== ls[10].productId || restrictionText(ls[9]) !== restrictionText(ls[10]) || ls[25].productId !== ls[26].productId || ls[25].origin === ls[26].origin) fail('repeat pair contracts');
    }
    if (r.primaryCategory === 'ordinary') {
      if (r.expected.lines.every(l => l.fixtureOracle.commitAllowed)) ordinaryClear++;
      if (r.expected.nameOnly) { nameOnly++; if (/Aimo ID/.test(r.input)) fail('name-only input contains SKU annotation'); }
      if (r.expected.lines.some(l => l.selection.mode === 'buyer_approved_equivalents')) equivalent++;
    }
    if (['conversation', 'transport'].includes(r.primaryCategory)) {
      const s = r.expected.stateContract;
      if (!s?.initial || !s.final || s.turns.length !== r.sequence.length || s.turns.some(t => !t.before || !t.after || !t.intent || !t.outcome)) fail('state contract');
      if (JSON.stringify(s.initial) !== JSON.stringify(s.turns[0].before)) fail('state initial chain');
      for (let i = 1; i < s.turns.length; i++) if (JSON.stringify(s.turns[i - 1].after) !== JSON.stringify(s.turns[i].before)) fail('state chain');
      if (s.final.approvalCount !== 0 || s.final.orderCount !== s.final.receipts.length) fail('state receipt/approval counts');
      if (s.final.orderCount > 0 && s.final.receipts.some(receipt => receipt.totalExVat > 1950)) fail('unapproved spend');
      if (s.turns.filter(t => t.outcome === 'proposal_required').some(t => t.after.pending.lines.some(l => !Number.isFinite(l.salesUnits) || !Number.isFinite(l.totalExVat)))) fail('unverified viable state preview');
    }
  }
  if (exact100 < 100 || nameOnly < 50 || ordinaryClear < 150 || equivalent < 20) fail(`coverage exact100=${exact100}, nameOnly=${nameOnly}, ordinaryClear=${ordinaryClear}, equivalent=${equivalent}`);
  return { scenarios: rows.length, development: rows.filter(r => r.split === 'development').length, holdout: rows.filter(r => r.split === 'holdout').length,
    categories: Object.fromEntries(Object.keys(categoryCounts).map(c => [c, { total: rows.filter(r => r.primaryCategory === c).length, holdout: rows.filter(r => r.primaryCategory === c && r.split === 'holdout').length }])),
    exact100ItemRequests: exact100, allLongHaveEarlyItemLateCorrectionAndBothRepeats: true, nameOnlyOrdinary: nameOnly, viableOrdinary: ordinaryClear, explicitEquivalentOrdinary: equivalent,
    uniqueSemanticSignatures: meanings.size, stateContracts: rows.filter(r => r.expected.stateContract).length, statePurchaseFlows: rows.filter(r => r.expected.stateContract?.final.orderCount > 0).length };
}

export function loadOriginal(dir) {
  const manifestBytes = readFileSync(resolve(dir, 'checksums.json')), manifest = JSON.parse(manifestBytes);
  if (manifest.version !== 2 || manifest.campaignId !== campaignId) throw Error('Wrong v2 freeze');
  for (const [name, entry] of Object.entries(manifest.files)) if (sha256(readFileSync(resolve(dir, name))) !== entry.sha256) throw Error(`Original hash mismatch: ${name}`);
  const anchorText = execFileSync('git', ['show', 'a9f9f1c87d894a0e9b899d5b284b8c1587b1d2e0:scripts/order-campaign/corpus-v2.commitments.jsonl'], { cwd: repo, encoding: 'utf8', maxBuffer: 2e6 });
  const anchor = new Map(anchorText.trim().split(/\r?\n/).map(JSON.parse).map(r => [r.scenarioId, r]));
  const rows = [...readRows(resolve(dir, 'development.jsonl')), ...readRows(resolve(dir, 'holdout.jsonl'))];
  for (const row of rows) if (hashObject(row) !== anchor.get(row.scenarioId)?.contentHash || row.split !== anchor.get(row.scenarioId)?.split) throw Error('Original commitment mismatch');
  for (const [name, hash] of Object.entries(manifest.sourceHashes)) if (sha256(readFileSync(resolve(repo, name))) !== hash) throw Error(`Source changed since v2: ${name}`);
  return { rows: rows.sort((a, b) => a.caseId.localeCompare(b.caseId)), manifest, manifestSha256: sha256(manifestBytes), anchorCommit: 'a9f9f1c87d894a0e9b899d5b284b8c1587b1d2e0' };
}
function outsideRepo(dir) {
  const rel = relative(repo, resolve(dir));
  if (!rel || !rel.startsWith('..') && !isAbsolute(rel)) throw Error('Corpus including holdout must stay outside Git');
}
export function commitmentFor(row) {
  return { scenarioId: row.scenarioId, primaryCategory: row.primaryCategory, split: row.split, itemCount: row.itemCount,
    inputHash: hashObject({ input: row.input, sequence: row.sequence ?? null }), expectationHash: hashObject(row.expected), contentHash: hashObject(row) };
}
export function freezeRevision({ originalDir, outputDir, commitmentsPath }) {
  outsideRepo(outputDir);
  if (existsSync(commitmentsPath) || existsSync(outputDir) && readdirSync(outputDir).length) throw Error('Immutable target already exists');
  const original = loadOriginal(originalDir), sources = loadSources();
  const { rows, viablePoolSize } = reviseRows(original.rows, sources), summary = validateCorpus(rows, original.rows);
  const prior = new Map(original.rows.map(r => [r.caseId, r]));
  const ledger = rows.map(r => ({ scenarioId: r.scenarioId, split: r.split, category: r.primaryCategory, version: 3,
    before: commitmentFor(prior.get(r.caseId)), after: commitmentFor(r), reasons: r.revision.reasons, appliedToOriginal: false, reviewState: 'pending_A4_or_coordinator_independent_review' }));
  const commitments = rows.map(commitmentFor);
  const files = { 'development.jsonl': jsonl(rows.filter(r => r.split === 'development')), 'holdout.jsonl': jsonl(rows.filter(r => r.split === 'holdout')),
    'commitments.jsonl': jsonl(commitments), 'revision-ledger.jsonl': jsonl(ledger),
    'original-hash-ledger.json': JSON.stringify({ manifestSha256: original.manifestSha256, anchorCommit: original.anchorCommit, originalManifest: original.manifest }, null, 2) + '\n' };
  const extraSources = ['AGENTS.md', 'api/openapi.json', 'challenge/product_data_schema.json', 'GROUND_TRUTH.md', 'apps/api/src/whatsapp/service.ts', 'apps/api/src/whatsapp/interpreter.ts', 'apps/api/src/whatsapp/routes.ts',
    'scripts/order-campaign/corpus-v3.mjs', 'scripts/order-campaign/corpus-v3-oracle.mjs', 'scripts/order-campaign/corpus-v3-state.mjs', 'scripts/order-campaign/corpus-v3-audit.mjs', 'scripts/order-campaign/corpus-v3.test.mjs'];
  const manifest = { version: 3, campaignId, clock, authoredAt: new Date().toISOString(), freezeBeforeFutureExecution: true, independentlyApproved: false,
    entropy: 'OS random product selection; no seed exported; frozen outputs alone are authoritative', baseOriginal: { manifestSha256: original.manifestSha256, files: original.manifest.files },
    sourceHashes: { ...original.manifest.sourceHashes, ...Object.fromEntries(extraSources.map(p => [p, sha256(readFileSync(resolve(repo, p)))])) },
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, { sha256: sha256(bytes), bytes: Buffer.byteLength(bytes) }])), summary: { ...summary, viablePoolSize },
    limitations: ['Version 3 is authored by A2 and requires independent A4/coordinator review.', 'Fixture-only expected outcomes; no model or channel pass claim.', 'Holdout confidentiality relies on role discipline and external storage, not a filesystem ACL.', 'Data dictionary and GROUND_TRUTH prefer a comparison-price ratio; the campaign revision refines this using manufacturer content and cent rounding and requires adjudication.', 'No recipe equivalence is inferred: only catalog-listed pairs explicitly approved by the chef in the request are accepted.'] };
  mkdirSync(outputDir, { recursive: true });
  for (const [name, bytes] of Object.entries(files)) writeFileSync(resolve(outputDir, name), bytes, { flag: 'wx' });
  writeFileSync(resolve(outputDir, 'checksums.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  writeFileSync(commitmentsPath, files['commitments.jsonl'], { flag: 'wx' });
  return manifest;
}

export function loadRevision({ corpusDir = resolve(artifactRoot, 'corpus-v3'), includeHoldout = false, commitmentsPath = resolve(repo, 'scripts/order-campaign/corpus-v3.commitments.jsonl') } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(corpusDir, 'checksums.json'), 'utf8'));
  if (manifest.version !== 3 || manifest.clock !== clock || manifest.campaignId !== campaignId) throw Error('Wrong v3 manifest');
  const verify = name => { const bytes = readFileSync(resolve(corpusDir, name)); if (sha256(bytes) !== manifest.files[name]?.sha256) throw Error(`v3 checksum mismatch: ${name}`); return readRows(resolve(corpusDir, name)); };
  const commitments = verify('commitments.jsonl');
  if (JSON.stringify(readRows(commitmentsPath)) !== JSON.stringify(commitments)) throw Error('Published commitments differ');
  const rows = [...verify('development.jsonl'), ...(includeHoldout ? verify('holdout.jsonl') : [])], byId = new Map(commitments.map(c => [c.scenarioId, c]));
  for (const row of rows) if (JSON.stringify(commitmentFor(row)) !== JSON.stringify(byId.get(row.caseId))) throw Error('v3 row commitment mismatch');
  if (!includeHoldout && (rows.length !== 800 || rows.some(r => r.split !== 'development'))) throw Error('Wrong development split');
  return { rows, manifest };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'freeze') {
    if (!args.includes('--auditor')) throw Error('Freeze reads hidden holdout: requires --auditor role');
    console.log(JSON.stringify(freezeRevision({ originalDir: resolve(artifactRoot, 'corpus'), outputDir: args.find(a => a.startsWith('--out='))?.slice(6) || resolve(artifactRoot, 'corpus-v3'), commitmentsPath: resolve(repo, 'scripts/order-campaign/corpus-v3.commitments.jsonl') }).summary));
  } else if (command === 'validate') {
    const { rows, manifest } = loadRevision({ includeHoldout: args.includes('--auditor') });
    console.log(JSON.stringify(args.includes('--auditor') ? validateCorpus(rows) : { development: rows.length, freezeSummary: manifest.summary }));
  } else throw Error('Usage: corpus-v3.mjs freeze --auditor [--out=external-dir] | validate [--auditor]');
}
