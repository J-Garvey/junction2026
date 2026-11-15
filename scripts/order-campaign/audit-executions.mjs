/** Independent, read-only execution audit. No application, generator, or authored oracle imports. */
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync, openSync, writeSync, closeSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const hash = x => createHash('sha256').update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x)).digest('hex');
export const rows = p => readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(JSON.parse);
export const inputHash = r => hash({ input: r.seedInput ?? r.input, sequence: r.sequence ?? null });
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const channel = c => ({ 'whatsapp-simulator': 'whatsapp', simulator: 'whatsapp', api: 'main', 'web-api': 'main', 'gateway-v1': 'gateway' })[c] || c;
const sum = xs => xs.reduce((n, x) => n + x, 0);
export function quantity(amount, unit) {
  const u = { kg: [1, 'kg'], g: [.001, 'kg'], l: [1, 'l'], ml: [.001, 'l'], dl: [.1, 'l'], pcs: [1, 'pcs'] }[unit];
  return Number.isFinite(amount) && u ? { amount: amount * u[0], unit: u[1] } : null;
}
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));

/** Default never opens holdout; externally committed bytes and each content hash are verified. */
export function loadCorpus(dir, commitmentsPath, auditor = false) {
  const manifestBytes = readFileSync(resolve(dir, 'checksums.json'));
  const manifest = JSON.parse(manifestBytes), commitments = rows(commitmentsPath);
  if (manifest.campaignId !== 'api-quality-20261115-c8a4' || manifest.clock !== '2026-11-14T10:00:00Z') throw Error('Wrong campaign/clock');
  const verify = name => {
    const bytes = readFileSync(resolve(dir, name));
    if (hash(bytes) !== manifest.files[name]?.sha256) throw Error(`Checksum mismatch: ${name}`);
    return rows(resolve(dir, name));
  };
  if (!eq(verify('commitments.jsonl'), commitments)) throw Error('Published commitments differ');
  const records = [...verify('development.jsonl'), ...(auditor ? verify('holdout.jsonl') : [])];
  const byId = new Map(commitments.map(c => [c.scenarioId, c]));
  for (const r of records) if (byId.get(r.caseId)?.contentHash !== hash(r)) throw Error('Row content commitment differs');
  return { records, manifest, manifestHash: hash(manifestBytes), executionManifestHash: manifest.files['development.jsonl'].sha256 };
}

/** Only complete, newline-terminated records at invocation are included. Live appends remain untouched. */
export async function scanJsonl(path, visit) {
  const length = statSync(path).size, digest = createHash('sha256');
  let pending = Buffer.alloc(0), completeBytes = 0, lines = 0, malformed = 0;
  if (length) for await (const chunk of createReadStream(path, { start: 0, end: length - 1 })) {
    pending = Buffer.concat([pending, chunk]); let start = 0, end;
    while ((end = pending.indexOf(10, start)) !== -1) {
      const bytes = pending.subarray(start, end + 1); digest.update(bytes); completeBytes += bytes.length; start = end + 1;
      if (!bytes.toString('utf8').trim()) continue;
      lines++; let row;
      try { row = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { malformed++; await visit(null, { line: lines, malformed: true }); continue; }
      await visit(row, { line: lines });
    }
    pending = pending.subarray(start);
  }
  return { bytesAtStart: length, completeBytes, trailingBytes: pending.length, completeSha256: digest.digest('hex'), lines, malformed };
}

export function callsFor(o) {
  const map = new Map();
  for (const c of o.related || []) map.set(c.callId || hash([c.path, c.body, c.purpose]), c);
  if (o.http && ![...map.values()].some(c => c.path === o.http.path && eq(c.body, o.http.body))) map.set('primary', { ...o.http, status: o.status, response: o.response, elapsedMs: o.elapsedMs });
  return [...map.values()];
}
const requestLines = o => o.response?.request?.lines ?? null;
const constraints = l => ({ claims: [...(l.claims || [])].sort(), avoidAllergens: [...(l.avoidAllergens || [])].sort(), origin: l.origin || null });

/** Group compatible repeats only. Incompatible repeats require independently bound parsed positions. */
export function checkLines(expected, actual) {
  const groups = new Map(), differences = [], counted = new Set();
  let matchedPositions = 0, missingPositions = 0, quantityDifferences = 0, missingQuantities = 0, lostClaims = 0, lostAllergens = 0, lostOrigins = 0, ambiguousPositions = 0;
  for (const l of expected) {
    const key = hash([l.productId, constraints(l)]), group = groups.get(key) || [];
    group.push(l); groups.set(key, group);
  }
  for (const ls of groups.values()) {
    const first = ls[0], ids = first.selection?.acceptedProductIds || [first.productId];
    let candidates = actual.map((l, index) => ({ l, index })).filter(({ l }) => ids.includes(l.productId));
    const incompatible = expected.some(l => ids.includes(l.productId) && !eq(constraints(l), constraints(first)));
    if (incompatible) candidates = candidates.filter(({ l }) => eq(constraints(l.constraints || {}), constraints(first)));
    if (!candidates.length) {
      missingPositions += ls.length; differences.push({ lineIds: ls.map(l => l.lineId), issue: incompatible ? 'missing_independently_constrained_position' : 'missing_product_position' }); continue;
    }
    if (candidates.some(c => counted.has(c.index))) { ambiguousPositions += ls.length; differences.push({ lineIds: ls.map(l => l.lineId), issue: 'ambiguous_duplicate_alignment' }); continue; }
    candidates.forEach(c => counted.add(c.index)); matchedPositions += ls.length;
    const wanted = ls.map(l => quantity(l.amount, l.unit)), got = candidates.map(({ l }) => quantity(l.quantity?.amount, l.quantity?.unit));
    if (wanted.some(q => !q) || new Set(wanted.filter(Boolean).map(q => q.unit)).size > 1) {
      ambiguousPositions += ls.length; differences.push({ lineIds: ls.map(l => l.lineId), issue: 'quantity_expectation_not_comparable' });
    } else if (got.some(q => !q || !(q.amount > 0))) {
      missingQuantities += ls.length; differences.push({ lineIds: ls.map(l => l.lineId), issue: 'missing_or_invalid_quantity' });
    } else if (got.some(q => q.unit !== wanted[0].unit) || !near(sum(wanted.map(q => q.amount)), sum(got.map(q => q.amount)))) {
      quantityDifferences += ls.length; differences.push({ lineIds: ls.map(l => l.lineId), issue: 'quantity_differs_from_final_requested_amount' });
    }
    for (const { l } of candidates) {
      const c = l.constraints || {};
      for (const x of first.claims || []) if (!c.claims?.includes(x)) { lostClaims++; differences.push({ lineIds: ls.map(l => l.lineId), issue: 'lost_claim', claim: x }); }
      for (const x of first.avoidAllergens || []) if (!c.avoidAllergens?.includes(x)) { lostAllergens++; differences.push({ lineIds: ls.map(l => l.lineId), issue: 'lost_allergen_constraint', allergen: x }); }
      if (first.origin && c.origin !== first.origin) { lostOrigins++; differences.push({ lineIds: ls.map(l => l.lineId), issue: 'lost_origin' }); }
    }
  }
  const unaccountedParsedPositions = actual.length - counted.size;
  return { expectedPositions: expected.length, parsedPositions: actual.length, matchedPositions, missingPositions, quantityDifferences, missingQuantities, lostClaims, lostAllergens, lostOrigins,
    ambiguousPositions, unaccountedParsedPositions, differences,
    complete: !missingPositions && !quantityDifferences && !missingQuantities && !lostClaims && !lostAllergens && !lostOrigins && !ambiguousPositions && !unaccountedParsedPositions };
}

/** SQL records, never conversation prose, are the authority for persistent effects. */
export function persisted(o) {
  const before = o.snapshots?.persistedBefore, after = o.snapshots?.persistedAfter;
  const tables = s => s?.tables || (s?.orders ? s : null);
  const b = tables(before), a = tables(after);
  if (!b || !a) return { verified: false };
  const counts = {}, additions = {};
  for (const table of ['events', 'plans', 'orders', 'approvals', 'quotes']) {
    if (!Array.isArray(b[table]) || !Array.isArray(a[table])) continue;
    const oldIds = new Set(b[table].map(x => x.id));
    counts[table] = { before: b[table].length, after: a[table].length };
    additions[table] = a[table].filter(x => !oldIds.has(x.id));
  }
  return { verified: true, counts, additions, changedTables: Object.keys(b).filter(t => !eq(b[t], a[t])), before, after };
}

/** Verify explicit factual claims against frozen supplier/catalogue facts; don't infer safety from reassuring prose. */
export function factualClaims(o, sources) {
  const result = { candidatesChecked: 0, knownStockWithoutEvidence: 0, verifiedPackDisagrees: 0, unverifiedVerifiedPackClaims: 0, dietaryCandidateMismatches: 0, differences: [] };
  if (!sources) return { ...result, status: 'source_facts_not_supplied' };
  const plans = [...(o.related || []).map(c => c.response?.plan), o.response?.plan].filter(Boolean), seen = new Set();
  for (const plan of plans) for (const need of plan.needs || []) for (const c of need.candidates || []) {
    const key = hash([plan.id, need.id, c.productId]); if (seen.has(key)) continue; seen.add(key); result.candidatesChecked++;
    const p = sources.catalog.get(c.productId), a = sources.fixture.availability[c.productId], price = sources.fixture.price[c.productId], s = a?.scheduleLines?.[0];
    const multiplier = p?.units?.[s?.salesUnit], sentinel = a?.logisticModel === 'Terminal' || s?.availableAmount === 9999999999 || multiplier > 0 && Math.abs(s?.availableAmount * multiplier - 9999999999) < 10;
    if (c.stock?.kind === 'known' && (!s?.availableDate || sentinel || a?.salesBlock || s?.salesBlock || !Number.isFinite(s?.availableAmount) || !near(c.stock.amount, s.availableAmount))) {
      result.knownStockWithoutEvidence++; result.differences.push({ productId: c.productId, issue: 'claimed_known_stock_without_saved_fixture_evidence' });
    }
    if (c.packContent?.verified) {
      const dimension = c.packContent.unit, manufacturer = p?.net_src === 'synkka' || dimension === 'kg' && p?.net_src === 'synkka+name';
      const content = dimension === 'kg' ? p?.net_kg : dimension === 'l' ? p?.net_l : dimension === 'pcs' && p?.bu === 'ST' ? 1 : null;
      const exact = content * multiplier, comparison = price?.comparisonPrice?.value;
      const corroborated = dimension === 'pcs' || price?.comparisonUnit?.toLowerCase() === dimension && comparison > 0 && Math.abs(price?.catalogPrice?.value / exact - comparison) <= .005000001;
      if (content > 0 && multiplier > 0 && (manufacturer || dimension === 'pcs') && !p.var_weight && corroborated) {
        if (!near(c.packContent.value, exact)) { result.verifiedPackDisagrees++; result.differences.push({ productId: c.productId, issue: 'verified_pack_conflicts_with_corroborated_manufacturer_content' }); }
      } else { result.unverifiedVerifiedPackClaims++; result.differences.push({ productId: c.productId, issue: 'verified_pack_claim_needs_independent_source_adjudication' }); }
    }
    const cons = need.constraints || {};
    if ((cons.claims || []).some(x => !p?.claims?.includes(x)) || (cons.avoidAllergens || []).some(x => p?.contains?.includes(x) || p?.may_contain?.includes(x) || !p?.free_from?.includes(x) || !p?.has_allergen_data)) {
      result.dietaryCandidateMismatches++; result.differences.push({ productId: c.productId, issue: 'candidate_does_not_meet_bound_diet_constraints' });
    }
  }
  return { ...result, status: 'checked_against_frozen_sources', limitation: 'Candidate findings are not proof of a committed order or a user-visible assertion; unverified pack claims need adjudication.' };
}

/** Concrete fixture/setup projection; dynamic IDs are bound to unique names, never discarded blindly. */
export function setupFor(o) {
  const s = o.scenario || {}, before = o.snapshots?.persistedBefore;
  const t = before?.tables, actor = t?.people?.find(p => p.id === (s.effectivePerson || s.person));
  const conversation = before?.kv?.find(k => k.key === `whatsapp:person:${s.effectivePerson || s.person}`)?.value?.session?.conversation;
  const selected = t?.events?.find(e => e.id === conversation?.activeOrderId)?.name;
  return { clock: before?.clock?.time || s.clock || null, person: s.effectivePerson || s.person || null,
    fixtureHash: o.fixtureHash ?? null,
    actor: actor ? { role: actor.role, hotelId: actor.hotelId, outlets: actor.outlets } : null,
    removedDefaultEvent: s.removedDefaultEvent ?? null,
    drafts: (s.drafts || []).map(d => ({ name: d.name, deliveryDate: d.deliveryDate })), seededLines: s.seededLines ?? null,
    events: t?.events?.map(e => ({ name: e.name, deliveryDate: e.deliveryDate })) ?? null,
    orderCount: t?.orders?.length ?? null, approvalCount: t?.approvals?.length ?? null,
    plans: t?.plans?.length ?? null, selectedScope: selected ?? null, pending: conversation?.pending ?? null,
    mandate: t?.mandates?.map(m => ({ hotelId: m.hotelId, sites: m.sites?.map(x => x.id), spendCapEur: m.spendCapEur, preAnswers: m.preAnswers })) ?? null };
}
export function setupIssues(o, frozen) {
  const actual = setupFor(o), contract = frozen.expected.stateContract;
  const issues = [];
  if (actual.clock !== '2026-11-14T10:00:00Z' && actual.clock !== '2026-11-14T10:00:00.000Z') issues.push('wrong_or_unproven_clock');
  if (contract) {
    const want = [...contract.setup.emptyDrafts].sort(), got = actual.events?.map(x => x.name).sort();
    if (!eq(want, got)) issues.push('initial_drafts_differ');
    if (actual.seededLines?.length !== 0 || actual.plans !== 0) issues.push('initial_baskets_not_proven_empty');
    if (actual.orderCount !== contract.initial.orderCount || actual.approvalCount !== contract.initial.approvalCount) issues.push('initial_order_approval_counts_differ');
    if (actual.person !== contract.authority.personId || actual.actor?.role !== contract.authority.role || actual.actor?.hotelId !== contract.authority.hotelId) issues.push('actor_authority_differs');
    if (actual.selectedScope !== contract.initial.selectedScope || actual.pending !== contract.initial.pending) issues.push('initial_selection_or_pending_differs');
    if (!eq([...(actual.actor?.outlets || [])].sort(), [...contract.authority.outlets].sort())) issues.push('actor_outlet_authority_differs');
    if (actual.events?.some(e => e.deliveryDate !== contract.setup.deliveryDate)) issues.push('initial_delivery_date_differs');
    if (!actual.mandate?.some(m => m.hotelId === contract.authority.hotelId && m.spendCapEur === contract.authority.spendCapEur && eq(m.sites, [contract.authority.siteId]))) issues.push('mandate_differs');
  }
  return { projection: actual, setupHash: hash(actual), issues };
}

export function auditObservation(o, frozen, provenance = {}) {
  const base = { caseId: o.caseId, executionId: o.executionId, attemptId: o.attemptId, runId: o.runId, channel: channel(o.channel), mode: o.modelMode || 'unlabeled', sha: o.sha, status: o.status,
    disposition: 'ambiguous_expectation', interpretation: 'not_demonstrated', reasons: [], inputHash: inputHash(o), sourceLine: provenance.line };
  const calls = callsFor(o), effects = persisted(o);
  base.factualClaims = factualClaims(o, provenance.sources);
  base.counts = { http: calls.length, conversationDeliveries: calls.filter(c => /whatsapp\/messages$/.test(c.path) && !c.purpose).length,
    selectionSupportDeliveries: calls.filter(c => c.purpose === 'select-active-order').length,
    retryDeliveries: calls.filter(c => /retry|replay/.test(c.purpose || '')).length,
    planning: calls.filter(c => c.path === '/api/requests').length,
    modelHttp: (o.telemetry || []).filter(t => t.kind === 'model').length, model2xx: (o.telemetry || []).filter(t => t.kind === 'model' && t.status >= 200 && t.status < 300).length };
  base.effects = { verified: effects.verified, counts: effects.counts, changedTables: effects.changedTables };
  if (!frozen || base.inputHash !== inputHash(frozen)) { base.reasons.push('unknown_or_changed_frozen_input'); return base; }
  base.corpusVersion = frozen.revision?.version || 2;
  base.primaryCategory = frozen.primaryCategory; base.exact100 = frozen.primaryCategory === 'long' && frozen.itemCount === 100;
  if (o.unsupported || o.executionState === 'unsupported') { base.disposition = 'not_executed'; base.reasons.push('unsupported_channel_contract'); return base; }
  if (o.error || o.status == null || o.status >= 500) { base.disposition = 'infrastructure_failure'; base.reasons.push(o.error ? 'execution_or_setup_exception' : 'http_server_failure'); return base; }
  if (typeof frozen.input === 'string') {
    const path = base.channel === 'whatsapp' ? '/api/whatsapp/messages' : base.channel === 'main' ? '/api/messages' : null;
    const delivered = path ? calls.filter(c => c.path === path && (!c.purpose || c.purpose === 'stateless-web-message-sequence')).map(c => c.body?.text) : [];
    const wanted = frozen.sequence || [frozen.input];
    base.deliveredInputHash = hash({ input: delivered[0] ?? null, sequence: frozen.sequence ? delivered : null });
    if (!eq(delivered, wanted)) { base.reasons.push('actual_http_payloads_do_not_match_frozen_sequence'); return base; }
  }
  if (base.corpusVersion === 3) {
    const setup = setupIssues(o, frozen); base.setupHash = setup.setupHash;
    // A v3 result is ineligible unless exact frozen payload, manifest AND pre-execution setup are anchored.
    if (o.manifestSha256 !== provenance.executionManifestHash || !provenance.executionManifestHash) base.reasons.push('v3_execution_manifest_not_anchored');
    if (!provenance.expectedFixtureHash || o.fixtureHash !== provenance.expectedFixtureHash) base.reasons.push('v3_fixture_hash_not_anchored');
    if (o.setupHash !== setup.setupHash || !o.setupHash) base.reasons.push('v3_pre_execution_setup_hash_missing_or_different');
    base.reasons.push(...setup.issues);
    if (base.reasons.length) { base.disposition = 'infrastructure_failure'; return base; }
  }
  const stateful = ['conversation', 'transport'].includes(frozen.primaryCategory);
  const ordersAdded = effects.additions?.orders || [];
  if (!stateful && ordersAdded.length && frozen.expected.noAutomaticPurchaseFromText) { base.disposition = 'fail'; base.reasons.push('persisted_order_without_purchase_authority'); return base; }
  if (o.status >= 400) {
    base.disposition = 'fail'; base.interpretation = 'rejected';
    const conversations = effects.after?.kv?.filter(k => k.key.startsWith('whatsapp:')).map(k => k.value?.session?.conversation) || [];
    const businessMutation = effects.changedTables?.some(t => ['events', 'plans', 'orders', 'approvals', 'quotes'].includes(t));
    base.safeRejection = effects.verified && !businessMutation && !ordersAdded.length && (base.channel === 'main' || conversations.length > 0 && conversations.every(c => c && c.pending === null));
    base.reasons.push('http_rejection_is_not_full_interpretation'); return base;
  }
  const parsed = requestLines(o);
  if (parsed) {
    base.lines = checkLines(frozen.expected.lines, parsed);
    if (!base.lines.complete) { base.disposition = base.lines.differences.every(d => d.issue === 'quantity_expectation_not_comparable') && !base.lines.unaccountedParsedPositions ? 'ambiguous_expectation' : 'fail'; base.reasons.push('requested_line_semantics_not_preserved'); return base; }
    base.interpretation = 'complete_parse_only';
    if (stateful) base.reasons.push('conversation_requires_persisted_turn_contract');
    else if (!frozen.plan) { base.disposition = 'pass'; base.reasons.push('independent_parse_fields_only'); return base; }
    else base.reasons.push(base.corpusVersion === 2 ? 'v2_pack_oracle_not_authoritative' : 'plan_and_all_guard_facts_require_independent_review');
  } else if (base.channel === 'whatsapp') {
    const deliveries = calls.filter(c => c.path === '/api/whatsapp/messages' && !c.purpose);
    const replies = deliveries.map(c => c.response?.messages?.find(m => m.id === `${c.body?.id}:reply`)?.reply?.status);
    base.replyStatuses = replies;
    if (!stateful && replies.length && replies.every(s => ['clarification', 'blocked', 'error'].includes(s))) { base.disposition = 'fail'; base.interpretation = 'safe_clarification_only'; base.reasons.push('no_complete_line_interpretation_evidence'); return base; }
    base.reasons.push('no_independently_aligned_full_line_evidence');
  } else base.reasons.push('missing_parse_evidence');
  if (stateful) base.reasons.push(base.corpusVersion === 2 ? 'v2_initial_turn_final_contract_incomplete' : 'per_turn_persisted_snapshots_and_contract_adjudication_required');
  if (!effects.verified) base.reasons.push('persisted_state_missing');
  return base;
}

export async function auditFile({ observations, corpus, commitments, output, auditor = false, raw }) {
  const loaded = loadCorpus(corpus, commitments, auditor), byId = new Map(loaded.records.map(r => [r.caseId, r]));
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const sourcePaths = ['data/products_slim.jsonl', 'data/fixtures/aimo/base.json'];
  const sourceVerified = sourcePaths.every(p => hash(readFileSync(resolve(repo, p))) === loaded.manifest.sourceHashes?.[p]);
  const sources = sourceVerified ? { catalog: new Map(rows(resolve(repo, sourcePaths[0])).map(p => [p.id, p])), fixture: JSON.parse(readFileSync(resolve(repo, sourcePaths[1]))) } : null;
  mkdirSync(dirname(output), { recursive: true });
  const fd = openSync(`${output}.verdicts.jsonl`, 'wx'), attempts = new Set(), covered = new Set(), latest = new Map();
  const summary = { createdAt: new Date().toISOString(), observations, corpus, manifestHash: loaded.manifestHash, corpusVersion: loaded.manifest.version || 2,
    verdicts: {}, channels: {}, modeChannels: {}, exact100: {}, cases: 0, duplicateAttemptRows: 0, lines: {}, factualClaims: {}, frozenSourcesVerified: sourceVerified, counts: {}, rawCounts: {}, performance: {}, limitations: [
      'No response-derived oracle. v2 pack arithmetic and final-state expectations cannot award semantic passes.',
      'Pass, when present, covers independent parse fields only; plans, confirmations, guard claims and persisted state require their own evidence.',
      'Simulator evidence is synthetic; no natural-language gateway equivalent, real transport, browser or real-model claim is inferred.',
      'v3 requires exact input/sequence, manifest and recorded pre-execution setup hashes. Unanchored observations are ineligible.',
      'Per-turn SQL snapshots are required for state-contract passes; reply text is not proof of persistence.' ] };
  const latencies = new Map();
  try {
    summary.coverage = await scanJsonl(observations, (o, meta) => {
      if (!o) { writeSync(fd, JSON.stringify({ disposition: 'infrastructure_failure', reasons: ['malformed_complete_jsonl_record'], sourceLine: meta.line }) + '\n'); return; }
      const key = `${o.runId}:${o.attemptId}`;
      if (o.attemptId && attempts.has(key)) { summary.duplicateAttemptRows++; writeSync(fd, JSON.stringify({ sourceLine: meta.line, attemptId: o.attemptId, disposition: 'ambiguous_expectation', reasons: ['duplicate_attempt_observation_not_another_execution'] }) + '\n'); return; }
      attempts.add(key);
      const v = auditObservation(o, byId.get(o.caseId), { ...meta, executionManifestHash: loaded.executionManifestHash, expectedFixtureHash: loaded.manifest.sourceHashes?.['data/fixtures/aimo/base.json'], sources });
      covered.add(`${o.caseId}:${channel(o.channel)}`); summary.cases++;
      latest.set(`${o.caseId}:${channel(o.channel)}`, v);
      for (const obj of [summary.verdicts, summary.channels[v.channel] ||= {}, summary.modeChannels[`${v.mode}:${v.channel}`] ||= {}, ...(v.exact100 ? [summary.exact100[v.channel] ||= {}] : [])]) obj[v.disposition] = (obj[v.disposition] || 0) + 1;
      for (const [k, n] of Object.entries(v.counts || {})) summary.counts[k] = (summary.counts[k] || 0) + n;
      for (const [k, n] of Object.entries(v.lines || {})) if (typeof n === 'number') summary.lines[k] = (summary.lines[k] || 0) + n;
      for (const [k, n] of Object.entries(v.factualClaims || {})) if (typeof n === 'number') summary.factualClaims[k] = (summary.factualClaims[k] || 0) + n;
      const timingKey = `${v.mode}:${v.channel}:${v.disposition}`;
      if (Number.isFinite(o.elapsedMs)) { const a = latencies.get(timingKey) || []; a.push(o.elapsedMs); latencies.set(timingKey, a); }
      writeSync(fd, JSON.stringify(v) + '\n');
    });
    // Every supported channel receives a disposition even before a row exists.
    for (const r of loaded.records) for (const c of r.channels || [r.channel || 'main']) {
      if (covered.has(`${r.caseId}:${channel(c)}`)) continue;
      const v = { caseId: r.caseId, channel: channel(c), disposition: 'not_executed', reasons: ['no_completed_observation_at_snapshot'], exact100: r.primaryCategory === 'long' && r.itemCount === 100 };
      latest.set(`${r.caseId}:${channel(c)}`, v);
      writeSync(fd, JSON.stringify(v) + '\n'); const g = summary.channels[v.channel] ||= {}; g.not_executed = (g.not_executed || 0) + 1;
      summary.verdicts.not_executed = (summary.verdicts.not_executed || 0) + 1;
      if (v.exact100) { const x = summary.exact100[v.channel] ||= {}; x.not_executed = (x.not_executed || 0) + 1; }
    }
  } finally { closeSync(fd); }
  const scenarioFd = openSync(`${output}.scenarios.jsonl`, 'wx'); summary.latestScenarioChannels = {}; summary.latestScenarioExact100 = {};
  try { for (const v of latest.values()) {
    writeSync(scenarioFd, JSON.stringify(v) + '\n');
    const g = summary.latestScenarioChannels[v.channel] ||= {}; g[v.disposition] = (g[v.disposition] || 0) + 1;
    if (v.exact100) { const x = summary.latestScenarioExact100[v.channel] ||= {}; x[v.disposition] = (x[v.disposition] || 0) + 1; }
  } } finally { closeSync(scenarioFd); }
  if (raw) summary.rawCoverage = await scanJsonl(raw, row => {
    if (!row) return;
    const key = row.kind === 'http-request' ? `http_requests_${row.role}` : row.kind === 'http-response' ? `http_responses_${row.attempt?.startsWith('support') ? 'support' : 'execution'}` : row.kind;
    summary.rawCounts[key] = (summary.rawCounts[key] || 0) + 1;
  });
  for (const [key, a] of latencies) { a.sort((a, b) => a - b); summary.performance[key] = { count: a.length, p50Ms: a[Math.ceil(a.length * .5) - 1], p95Ms: a[Math.ceil(a.length * .95) - 1], maxMs: a.at(-1), interpretation: 'mixed case elapsed includes setup/planning; not model latency or comparable success throughput' }; }
  const out = openSync(`${output}.summary.json`, 'wx'); try { writeSync(out, JSON.stringify(summary, null, 2) + '\n'); } finally { closeSync(out); }
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
  if (!args.observations || !args.corpus || !args.commitments || !args.output) throw Error('Usage: --observations=... --corpus=... --commitments=... --output=unique-prefix [--raw=raw-observations.jsonl] [--auditor]');
  const s = await auditFile({ ...args, auditor: args.auditor === true });
  console.log(JSON.stringify({ cases: s.cases, verdicts: s.verdicts, channels: s.channels, exact100: s.exact100, counts: s.counts, lines: s.lines, coverage: s.coverage }));
}
