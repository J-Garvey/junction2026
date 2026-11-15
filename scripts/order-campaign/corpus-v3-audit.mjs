/** A2 independent source arithmetic and incremental v2 baseline audit. Aggregate holdout output only. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artifactRoot, readRows, loadOriginal, loadSources, sha256, jsonl } from './corpus-v3.mjs';
import { normalize, packFact, oracleForLine, whole, money } from './corpus-v3-oracle.mjs';

export function auditOriginal(rows, sources) {
  const counts = { lines: 0, v2RoundedRatioComparable: 0, corroboratedPackDifferences: 0, corroboratedPackDifferencesDevelopment: 0, conversionUnknown: 0, disputedSourceLines: 0,
    conversationMissingCompleteState: 0, transportMissingCompleteState: 0, allTurnsUnconfirmed: 0, longBelow30: 0, longAbove100: 0, exact100: 0, exact100WithLateCorrection: 0 };
  const developmentRepros = [];
  for (const row of rows) {
    if (row.primaryCategory === 'conversation') {
      if (!row.expected.stateContract?.initial || !row.expected.stateContract?.final) counts.conversationMissingCompleteState++;
      if (row.expected.turns?.every(t => t.confirmed === false)) counts.allTurnsUnconfirmed++;
    }
    if (row.primaryCategory === 'transport' && (!row.expected.stateContract?.initial || !row.expected.stateContract?.final)) counts.transportMissingCompleteState++;
    if (row.primaryCategory === 'long') {
      if (row.itemCount < 30) counts.longBelow30++;
      if (row.itemCount > 100) counts.longAbove100++;
      if (row.itemCount === 100) { counts.exact100++; if (row.expected.corrections?.length) counts.exact100WithLateCorrection++; }
    }
    for (const line of row.expected.lines) {
      counts.lines++;
      const p = sources.catalog.get(line.productId), price = sources.fixture.price[line.productId], availability = sources.fixture.availability[line.productId];
      const n = normalize(line), fact = packFact(p, price, availability, n.normalizedUnit);
      if (fact.status !== 'verified') { counts.conversionUnknown++; if (fact.reason === 'manufacturer_API_comparison_conflict') counts.disputedSourceLines++; continue; }
      if (!(n.normalizedAmount > 0) || !(price?.catalogPrice?.value > 0) || !(price?.comparisonPrice?.value > 0) || price.comparisonUnit?.toUpperCase() !== n.normalizedUnit) continue;
      // Independently reproduce the inversion mathematically; never call the v2 author's oracle.
      const inverted = price.catalogPrice.value / price.comparisonPrice.value;
      const oldPacks = Math.ceil(Number((n.normalizedAmount / inverted).toFixed(8)));
      const packs = whole(n.normalizedAmount / fact.packSize);
      counts.v2RoundedRatioComparable++;
      if (oldPacks === packs) continue;
      counts.corroboratedPackDifferences++;
      if (row.split === 'development') {
        counts.corroboratedPackDifferencesDevelopment++;
        if (developmentRepros.length < 12 || ['aq2-ordinary-0064', 'aq2-long-0032'].includes(row.caseId)) developmentRepros.push({ scenarioId: row.caseId, lineId: line.lineId, productId: p.id,
          requested: n, source: { net_src: p.net_src, net_kg: p.net_kg ?? null, net_l: p.net_l ?? null, baseUnit: p.bu, apiSalesUnit: fact.salesUnit, multiplier: fact.baseUnitsPerSalesUnit,
            fixedPrice: price.catalogPrice.value, comparisonPrice: price.comparisonPrice.value, corroborationDiscrepancyEur: fact.comparisonDiscrepancyEur },
          independentlyComputed: { packSize: fact.packSize, packs, totalEur: money(packs * price.catalogPrice.value) }, v2Inversion: { packSize: inverted, packs: oldPacks, totalEur: money(oldPacks * price.catalogPrice.value) },
          frozenOraclePacks: line.fixtureOracle?.packs ?? null });
      }
    }
  }
  return { method: 'A2 manufacturer content times API-unit hierarchy; comparison price corroborates within half a cent; quantity independent from production and author code', counts, developmentRepros,
    holdoutPolicy: 'Full input read only by auditor; no individual holdout text, IDs or expectations in this report.' };
}

/** Evaluate only unchanged, independently readable v2 input semantics; v3 answers never score v2 inputs. */
export function auditBaseline(observations, development) {
  const known = new Map(development.map(r => [r.caseId, r])), groups = {}, details = [];
  for (const observation of observations) {
    const mode = observation.modelMode || 'unlabeled', key = `${mode}:${observation.channel}`;
    const group = groups[key] ||= { observations: 0, knownFrozenInputs: 0, unknownOrChangedInputs: 0, httpStatus: {}, withParsedRequest: 0, parseLineCountMatches: 0, parseLineCountDiffers: 0,
      comparableUniqueProductPositions: 0, missingExplicitProducts: 0, quantityDifferences: 0, lostRequiredClaims: 0, lostRequiredAllergens: 0, lostRequiredOrigins: 0, stateContractsNotScorableV2: 0, noAutomaticOrdersViolations: 0, unsupportedExecutions: 0 };
    group.observations++; group.httpStatus[observation.status ?? 'none'] = (group.httpStatus[observation.status ?? 'none'] || 0) + 1;
    const frozen = known.get(observation.caseId);
    if (!frozen || (observation.seedInput ?? observation.input) !== frozen.input && observation.input !== frozen.input) { group.unknownOrChangedInputs++; continue; }
    group.knownFrozenInputs++;
    if (observation.unsupported) group.unsupportedExecutions++;
    if (['conversation', 'transport'].includes(frozen.primaryCategory)) { group.stateContractsNotScorableV2++; continue; }
    const request = observation.response?.request;
    if (!request?.lines) continue;
    group.withParsedRequest++;
    const lineCountEqual = request.lines.length === frozen.expected.lines.length;
    group[lineCountEqual ? 'parseLineCountMatches' : 'parseLineCountDiffers']++;
    const differences = [];
    for (const l of frozen.expected.lines) {
      // Ambiguous repeated IDs need positional alignment; do not fabricate it from the response.
      if (frozen.expected.lines.filter(x => x.productId === l.productId).length !== 1) continue;
      const matches = request.lines.filter(x => x.productId === l.productId);
      group.comparableUniqueProductPositions++;
      if (!matches.length) { group.missingExplicitProducts++; differences.push({ lineId: l.lineId, issue: 'explicit_product_missing' }); continue; }
      if (matches.length !== 1) { differences.push({ lineId: l.lineId, issue: 'multiple_parsed_occurrences_requires_review' }); continue; }
      const parsed = matches[0], expectedAmount = normalize(l), actualAmount = normalize({ amount: parsed.quantity?.amount, unit: parsed.quantity?.unit });
      if (expectedAmount.normalizedAmount > 0 && expectedAmount.normalizedUnit && (expectedAmount.normalizedUnit !== actualAmount.normalizedUnit || Math.abs(expectedAmount.normalizedAmount - actualAmount.normalizedAmount) > 1e-8)) { group.quantityDifferences++; differences.push({ lineId: l.lineId, issue: 'requested_quantity_differs' }); }
      for (const c of l.claims) if (!parsed.constraints?.claims?.includes(c)) { group.lostRequiredClaims++; differences.push({ lineId: l.lineId, issue: 'required_claim_not_bound_to_product', claim: c }); }
      for (const a of l.avoidAllergens) if (!parsed.constraints?.avoidAllergens?.includes(a)) { group.lostRequiredAllergens++; differences.push({ lineId: l.lineId, issue: 'required_allergen_not_bound_to_product', allergen: a }); }
      if (l.origin && parsed.constraints?.origin !== l.origin) { group.lostRequiredOrigins++; differences.push({ lineId: l.lineId, issue: 'required_origin_not_bound_to_product' }); }
    }
    const beforeOrders = observation.snapshots?.persistedBefore?.orders, afterOrders = observation.snapshots?.persistedAfter?.orders;
    if (Array.isArray(beforeOrders) && Array.isArray(afterOrders) && afterOrders.length > beforeOrders.length) group.noAutomaticOrdersViolations++;
    if ((!lineCountEqual || differences.length) && details.length < 50) details.push({ scenarioId: frozen.caseId, executionId: observation.executionId, attemptId: observation.attemptId, mode, channel: observation.channel,
      frozenInputHash: sha256(JSON.stringify(frozen.input)), expectedPositions: frozen.expected.lines.length, observedParsedPositions: request.lines.length, differences });
  }
  return { groups, developmentDetails: details, limitation: 'Observations are not a response-derived answer key. No pack, final-state or order-success score uses the disputed v2 oracle. Duplicate-ID alignment, unsupported channels and v2 state contracts remain unscored. HTTP rejection is a completeness failure, not a successful fulfillment.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), full = args.includes('--auditor'), out = resolve(artifactRoot, 'A2'); mkdirSync(out, { recursive: true });
  // Default audit opens development only. Full source verification is explicit auditor access.
  const originalDir = resolve(artifactRoot, 'corpus');
  const original = full ? loadOriginal(originalDir).rows : readRows(resolve(originalDir, 'development.jsonl'));
  const sourceAudit = auditOriginal(original, loadSources());
  const sourcePath = resolve(out, full ? 'independent-source-audit-full.json' : 'independent-source-audit-development.json');
  writeFileSync(sourcePath, JSON.stringify(sourceAudit, null, 2) + '\n');
  console.log(JSON.stringify({ sourceAudit: sourcePath, counts: sourceAudit.counts }));
  if (args.includes('--baseline')) {
    const baselinePath = resolve(artifactRoot, 'baseline/requests.jsonl'), bytes = readFileSync(baselinePath);
    const text = bytes.toString('utf8'), complete = text.slice(0, text.lastIndexOf('\n') + 1);
    const observations = complete.split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const at = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const snapshotName = `baseline-snapshot-${at}.jsonl`;
    writeFileSync(resolve(out, snapshotName), complete, { flag: 'wx' });
    const result = { at, sourcePath: baselinePath, sourceBytesRead: bytes.length, completeSnapshotSha256: sha256(complete), incompleteTrailingBytes: Buffer.byteLength(text.slice(complete.length)),
      snapshotName, observations: observations.length, audit: auditBaseline(observations, original.filter(r => r.split === 'development')) };
    const reportPath = resolve(out, `baseline-audit-${at}.json`);
    writeFileSync(reportPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ baselineAudit: reportPath, observations: result.observations, groups: result.audit.groups }));
  }
}
