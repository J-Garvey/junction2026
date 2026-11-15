/** Read-only A1 audit. No production or corpus-author imports; no network or host. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const categories = { ordinary: 250, long: 200, conversation: 150, boundary: 150, linguistic: 100, resilience: 100, transport: 50 };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const rowsFrom = text => text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const sorted = values => [...values].sort();

/** Only explicit auditor access opens holdout. Never opens full.jsonl. */
export function readVerifiedCorpus({ corpusDir, includeHoldout = false, commitmentsPath }) {
  const manifest = JSON.parse(readFileSync(resolve(corpusDir, 'checksums.json'), 'utf8'));
  if (manifest.campaignId !== 'api-quality-20261115-c8a4' || manifest.clock !== '2026-11-14T10:00:00Z') throw Error('Wrong campaign or clock');
  function verified(name) {
    const bytes = readFileSync(resolve(corpusDir, name));
    if (hash(bytes) !== manifest.files[name]?.sha256) throw Error(`Checksum mismatch: ${name}`);
    return rowsFrom(bytes.toString('utf8'));
  }
  const commitments = verified('commitments.jsonl');
  if (commitmentsPath && JSON.stringify(rowsFrom(readFileSync(commitmentsPath, 'utf8'))) !== JSON.stringify(commitments)) throw Error('Published commitments mismatch');
  const rows = verified('development.jsonl');
  if (includeHoldout) rows.push(...verified('holdout.jsonl'));
  const byId = new Map(commitments.map(c => [c.scenarioId, c]));
  for (const row of rows) {
    const c = byId.get(row.scenarioId);
    if (!c || c.contentHash !== hash(JSON.stringify(row)) || ['primaryCategory', 'itemCount', 'split'].some(k => c[k] !== row[k])) throw Error('Row commitment mismatch');
  }
  return { rows, manifest, anchoredToPublishedCommitments: !!commitmentsPath };
}

/** Catalog base-unit conversions, never the ratio of two rounded prices. */
export function catalogConversion(line, product, availability) {
  const sale = availability?.scheduleLines?.[0]?.salesUnit;
  if (!product || !sale) return null;
  const factor = product?.units?.[sale] ?? (sale === product?.bu ? 1 : sale === product?.su ? product?.su_in_bu : undefined);
  if (!(factor > 0)) return null;
  let amount, perBase, evidence;
  if (['kg', 'g'].includes(line.unit)) {
    amount = line.amount / (line.unit === 'g' ? 1000 : 1);
    perBase = product.bu === 'KG' ? 1 : product.net_kg;
    evidence = product.bu === 'KG' ? 'base_unit' : product.net_src === 'synkka' || product.net_src === 'synkka+name' ? 'manufacturer_mass' : 'inferred_mass';
  } else if (['l', 'ml', 'dl'].includes(line.unit)) {
    amount = line.amount / (line.unit === 'ml' ? 1000 : line.unit === 'dl' ? 10 : 1);
    perBase = product.bu === 'L' ? 1 : product.net_l;
    evidence = product.bu === 'L' ? 'base_unit' : product.net_src === 'synkka' ? 'manufacturer_volume' : 'inferred_volume';
  } else if (line.unit === 'pcs' && product.bu === 'ST') {
    amount = line.amount; perBase = 1; evidence = 'base_unit';
  }
  if (!(line.amount > 0) || !(perBase > 0) || !Number.isFinite(amount)) return null;
  const packSize = perBase * factor;
  return { packSize, packs: Math.ceil(Number((amount / packSize).toFixed(8))), evidence };
}

function words(text) {
  return String(text ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
}

/** Secondary collision challenge removes brands, numeric sizes and cosmetic scope names. */
export function independentSignature(row, catalog) {
  const scopeNames = row.scenario?.drafts ?? [];
  const target = row.scenario?.selectActive ?? scopeNames[0];
  const scopes = [target, ...scopeNames.filter(s => s !== target)].filter(Boolean);
  function turnText(text) {
    let result = text;
    scopes.forEach((s, i) => { result = result.replaceAll(s, `scope${String.fromCharCode(97 + i)}`); });
    for (const line of row.expected.lines) result = result.replaceAll(line.product, 'catalogproduct');
    return words(result);
  }
  const lines = row.expected.lines.map(l => {
    const p = catalog.get(l.productId);
    const identity = p ? words((p.en ?? p.fi).replaceAll(p.brand || '\u0000', '')) : 'unknown product';
    return JSON.stringify({ identity, claims: sorted(l.claims), avoid: sorted(l.avoidAllergens), origin: l.origin ?? null });
  }).sort();
  return hash(JSON.stringify({ lines, rules: row.expected.globalRules ?? null, issue: row.expected.issue ?? null,
    turns: row.sequence?.slice(1).map(turnText), unsupported: row.expected.unsupportedCriteria ?? null,
    transport: row.expected.transport ?? null, duplicatePolicy: row.expected.duplicatePolicy ?? null,
    corrections: row.expected.corrections?.map(c => c.kind) ?? [] }));
}

export function auditRows(rows, catalog, fixture) {
  const categoryCounts = Object.fromEntries(Object.keys(categories).map(c => [c, { total: 0, development: 0, holdout: 0 }]));
  const signatures = new Set(), ids = new Set(), exactIds = new Set();
  const result = { scenarios: rows.length, categoryCounts, duplicateIds: 0, uniqueIndependentSignatures: 0,
    totalLines: 0, explicitIdLines: 0, long: { total: 0, exact100: 0, structured: 0, prose: 0, withCorrections: 0, exact100WithCorrections: 0, withUnrestrictedPositions: 0, missingPositionOrNeighbor: 0, missingInputId: 0, aboveMain2000: 0, aboveChat8000: 0 },
    arithmetic: { comparableLines: 0, packCountDisagreements: 0, manufacturerOrBaseUnitDisagreements: 0, inferredMetadataDisagreements: 0, roundingConsistentManufacturerOrBaseUnitDisagreements: 0, sourceConflictOrVariableWeightDisagreements: 0 },
    state: { conversations: 0, actualTurnLabelMismatches: 0, allTurnsUnconfirmed: 0, withoutExplicitFinalState: 0, transportsWithoutTurns: 0 },
    ordinary: { scenarios: 0, allLinesClearAccordingToFrozenOracle: 0 }, developmentExamples: { arithmetic: [], state: [] } };
  for (const row of rows) {
    if (!categoryCounts[row.primaryCategory]) throw Error('Unknown category');
    categoryCounts[row.primaryCategory].total++;
    categoryCounts[row.primaryCategory][row.split]++;
    if (ids.has(row.scenarioId)) result.duplicateIds++;
    ids.add(row.scenarioId); signatures.add(independentSignature(row, catalog));
    const lines = row.expected.lines;
    if (row.primaryCategory === 'ordinary') {
      result.ordinary.scenarios++;
      if (lines.every(l => [l.fixtureOracle?.blocks, l.fixtureOracle?.questions, l.fixtureOracle?.unknowns].every(a => a?.length === 0))) result.ordinary.allLinesClearAccordingToFrozenOracle++;
    }
    if (row.primaryCategory === 'long') {
      const s = result.long; s.total++;
      if (lines.length === 100) { s.exact100++; if (row.expected.corrections?.length) s.exact100WithCorrections++; }
      if (row.tags?.includes('structured')) s.structured++;
      if (row.tags?.includes('prose')) s.prose++;
      if (row.expected.corrections?.length) s.withCorrections++;
      if (lines.some(l => !l.claims.length && !l.avoidAllergens.length && !l.origin)) s.withUnrestrictedPositions++;
      const positions = new Set(lines.map(l => l.lineId));
      if (positions.size !== lines.length || lines.some(l => !positions.has(l.neighbor?.lineId) || !row.input.includes(l.lineId))) s.missingPositionOrNeighbor++;
      if (lines.some(l => !row.input.includes(l.productId))) s.missingInputId++;
      if (row.input.length > 2000) s.aboveMain2000++;
      if (row.input.length > 8000) s.aboveChat8000++;
    }
    if (row.primaryCategory === 'conversation') {
      const s = result.state; s.conversations++;
      if (row.expected.turns?.every(t => t.confirmed === false)) s.allTurnsUnconfirmed++;
      if (!row.expected.finalState) s.withoutExplicitFinalState++;
      const mismatches = [];
      row.sequence.forEach((text, i) => {
        const actual = /^confirm change$/i.test(text) ? 'confirm_change' : /^confirm order$/i.test(text) ? 'confirm_order' : /^cancel$/i.test(text) ? 'cancel' : /^show /i.test(text) ? 'show' : null;
        if (actual && row.expected.turns?.[i]?.operation !== actual) mismatches.push(i);
      });
      if (mismatches.length) {
        s.actualTurnLabelMismatches++;
        if (row.split === 'development' && result.developmentExamples.state.length < 3) result.developmentExamples.state.push({ scenarioId: row.scenarioId, turnIndexes: mismatches });
      }
    }
    if (row.primaryCategory === 'transport' && !row.expected.turns) result.state.transportsWithoutTurns++;
    for (const line of lines) {
      result.totalLines++; exactIds.add(line.productId);
      if (row.input.includes(line.productId)) result.explicitIdLines++;
      const conversion = catalogConversion(line, catalog.get(line.productId), fixture.availability[line.productId]);
      const oracle = line.fixtureOracle;
      if (!conversion || !Number.isInteger(oracle?.packs)) continue;
      result.arithmetic.comparableLines++;
      if (conversion.packs === oracle.packs) continue;
      result.arithmetic.packCountDisagreements++;
      const inferred = conversion.evidence.startsWith('inferred');
      result.arithmetic[inferred ? 'inferredMetadataDisagreements' : 'manufacturerOrBaseUnitDisagreements']++;
      const price = fixture.price[line.productId], p = catalog.get(line.productId);
      const sameDimension = price?.comparisonUnit === (['kg', 'g'].includes(line.unit) ? 'KG' : ['l', 'ml', 'dl'].includes(line.unit) ? 'L' : 'PCS');
      const roundingConsistent = sameDimension && !p.var_weight && Math.abs(price.catalogPrice.value / conversion.packSize - price.comparisonPrice?.value) <= 0.00500001;
      if (!roundingConsistent) result.arithmetic.sourceConflictOrVariableWeightDisagreements++;
      if (!inferred && roundingConsistent) result.arithmetic.roundingConsistentManufacturerOrBaseUnitDisagreements++;
      if (row.split === 'development' && !inferred && roundingConsistent && result.developmentExamples.arithmetic.length < 3) result.developmentExamples.arithmetic.push({ scenarioId: row.scenarioId, lineId: line.lineId, productId: line.productId, evidence: conversion.evidence, frozenPacks: oracle.packs, catalogPacks: conversion.packs, frozenTotalEur: oracle.totalEur, catalogTotalEur: Number((conversion.packs * price.catalogPrice.value).toFixed(2)) });
    }
  }
  result.uniqueIndependentSignatures = signatures.size;
  result.distinctExplicitIds = exactIds.size;
  result.structureMatchesRequestedScope = Object.entries(categories).every(([c, count]) => {
    const s = categoryCounts[c];
    return rows.length === 1000 ? s.total === count && s.development === count * 0.8 && s.holdout === count * 0.2 : rows.length === 800 && s.total === count * 0.8 && s.development === s.total && s.holdout === 0;
  });
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const corpusDir = value('corpus-dir');
  if (!corpusDir) throw Error('Required --corpus-dir=external-path; optional --include-holdout (auditors only), --commitments=published-jsonl, --out=aggregate-json');
  const includeHoldout = args.includes('--include-holdout');
  const { rows, manifest, anchoredToPublishedCommitments } = readVerifiedCorpus({ corpusDir, includeHoldout, commitmentsPath: value('commitments') });
  const catalogPath = resolve(repo, 'data/products_slim.jsonl'), fixturePath = resolve(repo, 'data/fixtures/aimo/base.json');
  const catalog = new Map(rowsFrom(readFileSync(catalogPath, 'utf8')).map(p => [p.id, p]));
  const sourcesMatchFreeze = Object.entries(manifest.sourceHashes).every(([path, expected]) => hash(readFileSync(resolve(repo, path))) === expected);
  const report = { kind: 'read-only-independent-oracle-audit', access: includeHoldout ? 'auditor-full-aggregate' : 'development-only', clock: manifest.clock,
    anchoredToPublishedCommitments, sourcesMatchFreeze, limitations: ['Counts are audit signals, not implementation pass rates.', 'Catalog-name normalization is a collision challenge, not proof of all semantic distinctions.', 'Inferred pack metadata disagreements require verification; manufacturer/base-unit mismatches are reported separately.', 'Turn labels and missing finalState require human state-oracle review; no production request was executed.', 'Examples are development-only; holdout text, line expectations and identifiers are never emitted.'],
    ...auditRows(rows, catalog, JSON.parse(readFileSync(fixturePath, 'utf8'))) };
  const output = JSON.stringify(report, null, 2) + '\n';
  if (value('out')) writeFileSync(resolve(value('out')), output, { flag: 'wx' });
  else process.stdout.write(output);
}
