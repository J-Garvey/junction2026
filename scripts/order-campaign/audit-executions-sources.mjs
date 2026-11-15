/** Independent corpus/source review. No imports from the corpus author or application. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { hash, inputHash, loadCorpus, rows, quantity } from './audit-executions.mjs';

const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-7;
const cent = n => Math.round(n * 100) / 100;
export function sourceHashEvidence(path, expected, repo, reviewed = null) {
  const target = resolve(repo, path), bytes = existsSync(target) ? readFileSync(target) : null;
  return { path, workingTreeSourceMissing: !bytes, matches: !!bytes && hash(bytes) === expected,
    lfTextMatches: !!bytes && hash(bytes.toString('utf8').replaceAll('\r\n', '\n')) === expected,
    ...(reviewed ? { reviewedGitBlobMatches: hash(reviewed) === expected, reviewedCrlfMatches: hash(reviewed.toString('utf8').replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')) === expected } : {}) };
}
/** Manufacturer content per base unit multiplied by returned API sales-unit hierarchy. */
export function sourcePack(line, product, price, availability) {
  const q = quantity(Number.isFinite(line.amount) ? line.amount : 1, line.unit), sale = availability?.scheduleLines?.[0]?.salesUnit;
  const multiplier = product?.units?.[sale];
  if (!q || sale === 'ZML' || !(multiplier > 0)) return null;
  const validAmount = Number.isFinite(line.amount) && line.amount > 0;
  if (q.unit === 'pcs' && product.bu === 'ST') return { size: multiplier, amount: validAmount ? q.amount : null, packs: validAmount ? Math.ceil(q.amount / multiplier - 1e-10) : null, sale };
  const manufacturer = product.net_src === 'synkka' || q.unit === 'kg' && product.net_src === 'synkka+name';
  const content = q.unit === 'kg' ? product.net_kg : q.unit === 'l' ? product.net_l : null;
  if (!manufacturer || !(content > 0) || product.var_weight || price?.error || !(price?.catalogPrice?.value > 0) || !(price?.comparisonPrice?.value > 0) || price?.comparisonUnit?.toLowerCase() !== q.unit) return null;
  const size = content * multiplier;
  // Check the rounded price interval, rather than using the price ratio as content.
  const impliedComparison = price.catalogPrice.value / size;
  if (Math.abs(impliedComparison - price.comparisonPrice.value) > .005000001) return null;
  return { size, amount: validAmount ? q.amount : null, packs: validAmount ? Math.ceil(q.amount / size - 1e-10) : null, sale };
}

export function reviewRows(original, revised, catalog, fixture, ledger) {
  const old = new Map(original.map(r => [r.caseId, r])), entries = new Map(ledger.map(r => [r.scenarioId, r]));
  const counts = { total: revised.length, categories: {}, development: 0, holdout: 0, long: 0, exact100: 0, longCorrectedEarly: 0, compatibleAndIncompatibleRepeats: 0,
    circularNeighbors: 0, ordinary: 0, ordinaryViable: 0, nameOnly: 0, equivalents: 0, stateContracts: 0, purchaseStates: 0, lines: 0,
    sourceVerified: 0, sourceUnknown: 0, originalCorroboratedPackErrors: 0, originalCorroboratedPackErrorsDevelopment: 0, ledgerVerified: 0, uniqueSemanticSignatures: 0 };
  const failures = [], repros = [];
  const signatures = new Set();
  const fail = (r, issue) => failures.push({ ...(r.split === 'development' ? { caseId: r.caseId } : { split: 'holdout' }), issue });
  for (const r of revised) {
    const meaning = id => {
      const p = catalog.get(id); let name = (p?.en || '').normalize('NFKC').toLowerCase();
      if (p?.brand) name = name.replaceAll(p.brand.toLowerCase(), ' ');
      return name.replace(/\d+(?:[.,]\d+)?/g, ' ').replace(/[^\p{L}]+/gu, ' ').trim();
    };
    const signature = hash({ category: r.primaryCategory, issue: r.expected.issue || r.family, service: r.expected.hotelService || null,
      neededBy: r.expected.neededBy, global: r.expected.globalRules || null,
      lines: r.expected.lines.map(l => ({ product: meaning(l.productId), claims: [...l.claims].sort(), allergens: [...l.avoidAllergens].sort(), origin: l.origin || null,
        accepted: (l.selection?.acceptedProductIds || [l.productId]).map(meaning).sort() })),
      turns: r.expected.stateContract?.turns.map(t => t.intent) || null, transport: r.special || null });
    if (signatures.has(signature)) fail(r, 'semantic_collision_after_removing_brand_quantities_and_IDs'); else signatures.add(signature);
    counts[r.split]++; const c = counts.categories[r.primaryCategory] ||= { total: 0, development: 0, holdout: 0 }; c.total++; c[r.split]++;
    const before = old.get(r.caseId), change = entries.get(r.caseId);
    if (!before || before.split !== r.split || before.primaryCategory !== r.primaryCategory) fail(r, 'original_identity_split_category_changed');
    if (!change || change.before?.contentHash !== hash(before) || change.after?.contentHash !== hash(r) || change.before?.inputHash !== inputHash(before) || change.after?.inputHash !== inputHash(r)
      || change.before?.expectationHash !== hash(before.expected) || change.after?.expectationHash !== hash(r.expected) || change.appliedToOriginal !== false
      || r.revision.originalContentHash !== hash(before) || r.revision.originalInputHash !== inputHash(before)) fail(r, 'revision_ledger_does_not_recompute');
    else counts.ledgerVerified++;
    for (const l of r.expected.lines) {
      counts.lines++; const p = catalog.get(l.productId), price = fixture.price[l.productId], avail = fixture.availability[l.productId];
      const f = sourcePack(l, p, price, avail), got = l.fixtureOracle;
      if (f) {
        counts.sourceVerified++;
        const total = f.packs === null ? null : cent(f.packs * price.catalogPrice.value);
        if (!close(f.size, got.packSize) || f.packs !== got.packs || !(total === got.totalEur || close(total, got.totalEur))) fail(r, 'source_quantity_or_total_disagrees');
      } else {
        counts.sourceUnknown++;
        if (got.packSize !== null || got.packs !== null || got.commitAllowed) fail(r, 'unverified_source_used_as_confirmed');
      }
      if (got.commitAllowed) {
        const s = avail?.scheduleLines?.[0];
        if (!s || s.availableDate !== '2026-11-16' || Date.parse(avail.closingTime) <= Date.parse('2026-11-14T10:00:00Z') || avail.salesBlock || s.salesBlock || avail.logisticModel !== 'Stock'
          || !(s.availableAmount >= got.packs) || s.availableAmount === 9999999999 || Math.abs(s.availableAmount * p.units[s.salesUnit] - 9999999999) < 10) fail(r, 'viable_line_has_unproven_stock_date_or_cutoff');
        if (l.claims.some(c => !p.claims?.includes(c)) || l.avoidAllergens.some(a => p.contains?.includes(a) || p.may_contain?.includes(a) || !p.free_from?.includes(a) || !p.has_allergen_data)
          || l.origin && l.origin !== p.origin) fail(r, 'viable_line_breaks_diet_or_origin');
        const quote = price?.catalogPrice;
        if (!quote || quote.currency !== 'EUR' || quote.validFrom.slice(0, 10) > '2026-11-14' || quote.validTo.slice(0, 10) < '2026-11-16') fail(r, 'viable_line_price_not_valid');
      }
    }
    for (const l of before.expected.lines) {
      const f = sourcePack(l, catalog.get(l.productId), fixture.price[l.productId], fixture.availability[l.productId]);
      if (f?.packs > 0 && l.fixtureOracle.packs !== f.packs) {
        counts.originalCorroboratedPackErrors++; if (r.split === 'development') counts.originalCorroboratedPackErrorsDevelopment++;
        if (r.split === 'development' && repros.length < 8) repros.push({ caseId: r.caseId, lineId: l.lineId, productId: l.productId, requested: quantity(l.amount, l.unit), verifiedPack: f.size, expectedPacks: f.packs, originalPacks: l.fixtureOracle.packs });
      }
    }
    if (r.primaryCategory === 'long') {
      counts.long++; const ls = r.expected.lines;
      if (ls.length === 100) counts.exact100++;
      if (ls.length < 30 || ls.length > 100 || r.itemCount !== ls.length || new Set(ls.map(l => l.lineId)).size !== ls.length) fail(r, 'long_count_or_positions');
      const correction = r.expected.corrections?.[0];
      const end = r.input.lastIndexOf('Late correction');
      if (correction?.lineId === 'L004' && end > r.input.lastIndexOf('[Aimo ID') && r.input.slice(end).includes(`with ${ls[3].amount} ${ls[3].unit}; do not add them`) && correction.previousAmount === ls[3].amount * 3) counts.longCorrectedEarly++; else fail(r, 'late_correction_not_bound_to_early_line');
      const signature = l => hash({ claims: l.claims, allergens: l.avoidAllergens, origin: l.origin || null });
      if (ls[9].productId === ls[10].productId && signature(ls[9]) === signature(ls[10]) && ls[25].productId === ls[26].productId && ls[25].origin !== ls[26].origin) counts.compatibleAndIncompatibleRepeats++; else fail(r, 'repeat_pair_missing');
      if (ls.every((l, i) => l.neighbor?.lineId === ls[(i + 1) % ls.length].lineId && l.neighbor.preserveIndependentRequirements && l.neighbor.mustNotCopyQuantity)) counts.circularNeighbors++; else fail(r, 'neighbor_contract_missing');
    }
    if (r.primaryCategory === 'ordinary') {
      counts.ordinary++;
      if (r.expected.lines.every(l => l.fixtureOracle.commitAllowed) && r.expected.lines.reduce((s, l) => s + l.fixtureOracle.totalEur, 0) <= 1950) counts.ordinaryViable++; else fail(r, 'ordinary_not_viable');
      if (r.expected.nameOnly) {
        counts.nameOnly++; if (/Aimo ID/.test(r.input)) fail(r, 'name_only_contains_ID');
        for (const l of r.expected.lines) if (!r.input.includes(l.product) || [...catalog.values()].filter(p => p.en?.toLowerCase() === l.product.toLowerCase()).length !== 1) fail(r, 'name_only_product_not_unique_in_catalog');
      }
      for (const l of r.expected.lines) if (l.selection.mode === 'buyer_approved_equivalents') {
        counts.equivalents++; const ids = l.selection.acceptedProductIds;
        if (ids.length < 2 || !catalog.get(ids[0]).subs?.includes(ids[1]) || !r.input.includes('I am the chef:') || !ids.every(id => r.input.includes(`[Aimo ID ${id}]`))) fail(r, 'equivalence_not_explicitly_authorized_and_catalog_linked');
      }
    }
    if (['conversation', 'transport'].includes(r.primaryCategory)) {
      counts.stateContracts++; const s = r.expected.stateContract;
      if (!s || s.turns.length !== r.sequence.length || !equal(s.initial, s.turns[0].before) || !equal(s.setup.emptyDrafts, r.scenario.drafts)
        || r.scenario.seedLines !== false || r.scenario.noSeedEvent !== true || r.scenario.selectActive !== s.initial.selectedScope) { fail(r, 'state_setup_contract_inconsistent'); continue; }
      for (let i = 0; i < s.turns.length; i++) {
        const t = s.turns[i];
        if (i && !equal(t.before, s.turns[i - 1].after)) fail(r, 'state_turn_chain_broken');
        if (t.intent === 'accept_change') {
          const p = t.before.pending;
          if (!p || p.scope !== t.before.selectedScope || t.after.pending !== null || !equal(t.after.baskets[p.scope], [...t.before.baskets[p.scope], ...p.lines])) fail(r, 'accept_does_not_bind_exact_pending_lines');
        }
        if (t.intent === 'cancel' && (!equal(t.before.baskets, t.after.baskets) || t.after.pending !== null)) fail(r, 'cancel_mutates_basket_or_keeps_pending');
        if (/no_mutation/.test(t.outcome) && !equal(t.before.baskets, t.after.baskets)) fail(r, 'no_mutation_turn_changes_basket');
        if (t.intent === 'select_order' && t.before.selectedScope !== t.after.selectedScope && t.after.pending !== null) fail(r, 'scope_change_preserves_stale_pending');
        if (t.outcome === 'one_mock_order_required') {
          counts.purchaseStates++;
          if (t.before.pending?.kind !== 'confirm_order' || t.before.orderCount !== 0 || t.after.orderCount !== 1 || t.after.approvalCount !== 0 || !equal(t.after.receipts[0].lines, t.before.pending.lines)) fail(r, 'purchase_does_not_bind_preview_or_receipt');
        }
      }
      const last = s.replay.at(-1)?.after || s.turns.at(-1).after;
      if (!equal(last, s.final)) fail(r, 'final_not_last_transition');
    }
  }
  counts.uniqueSemanticSignatures = signatures.size;
  return { counts, failures, developmentReproductions: repros, holdoutPolicy: 'Aggregate only; no hidden text or case-level hidden expectations emitted. No application execution.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
  const original = loadCorpus(args.original, args['original-commitments'], args.auditor === true), revised = loadCorpus(args.revised, args['revised-commitments'], args.auditor === true);
  const catalog = new Map(rows(resolve(args.repo, 'data/products_slim.jsonl')).map(p => [p.id, p])), fixture = JSON.parse(readFileSync(resolve(args.repo, 'data/fixtures/aimo/base.json')));
  const result = reviewRows(original.records, revised.records, catalog, fixture, rows(resolve(args.revised, 'revision-ledger.jsonl')));
  result.sourceHashes = Object.entries(revised.manifest.sourceHashes).map(([path, expected]) => {
    const reviewed = args['source-ref'] ? execFileSync('git', ['show', `${args['source-ref']}:${path}`], { cwd: args.repo, maxBuffer: 30e6 }) : null;
    return sourceHashEvidence(path, expected, args.repo, reviewed);
  });
  result.revisedFiles = Object.entries(revised.manifest.files).filter(([name]) => args.auditor === true || !['holdout.jsonl', 'full.jsonl'].includes(name))
    .map(([name, f]) => ({ name, matches: hash(readFileSync(resolve(args.revised, name))) === f.sha256 }));
  const preservedOriginal = JSON.parse(readFileSync(resolve(args.revised, 'original-hash-ledger.json')));
  result.originalHashLedgerMatches = equal(preservedOriginal.originalManifest, original.manifest) && preservedOriginal.manifestSha256 === revised.manifest.baseOriginal.manifestSha256;
  result.originalFiles = Object.entries(revised.manifest.baseOriginal.files).filter(([name]) => args.auditor === true || !['holdout.jsonl', 'full.jsonl'].includes(name))
    .map(([name, f]) => ({ name, matches: hash(readFileSync(resolve(args.original, name))) === f.sha256 }));
  result.originalManifestMatches = hash(readFileSync(resolve(args.original, 'checksums.json'))) === revised.manifest.baseOriginal.manifestSha256;
  writeFileSync(args.output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ counts: result.counts, failures: result.failures, sourceHashes: result.sourceHashes, originalFiles: result.originalFiles, originalManifestMatches: result.originalManifestMatches }));
}
