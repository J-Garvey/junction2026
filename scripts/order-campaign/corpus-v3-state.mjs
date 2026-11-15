/** Explicit simulator state contracts, authored before execution, never response-derived. */
import { money } from './corpus-v3-oracle.mjs';
export const scopes = ['Darragh', 'Pavit', 'Conference'];
const copy = structuredClone;
const basketLines = lines => lines.map(l => ({ lineId: l.lineId, productId: l.productId, requestedAmount: l.amount, requestedUnit: l.unit,
  salesUnits: l.fixtureOracle.packs, salesUnit: l.fixtureOracle.salesUnit, totalExVat: l.fixtureOracle.totalEur,
  unitPriceExVat: money(l.fixtureOracle.totalEur / l.fixtureOracle.packs), packSize: l.fixtureOracle.packSize, normalizedUnit: l.fixtureOracle.normalizedUnit,
  availableDate: l.fixtureOracle.availableDate, closingTime: l.fixtureOracle.closingTime, stock: l.fixtureOracle.stock, priceValidity: l.fixtureOracle.priceValidity,
  claims: l.claims, avoidAllergens: l.avoidAllergens, origin: l.origin ?? null }));
const addText = (lines, scope) => `add ${lines.map(l => `${l.amount} ${l.unit} product ${l.productId}${l.claims.length ? ' ' + l.claims.map(c => c === 'VEGAN' ? 'vegan' : c === 'FREE_FROM_LACTOSE' ? 'lactose-free' : 'gluten-free').join(' ') : ''}`).join('; ')} to ${scope}`;

export function stateScenario(row, lines, recompute) {
  const index = Number(row.caseId.slice(-4)) - 1;
  const transport = row.primaryCategory === 'transport';
  const mode = index % (transport ? 5 : 10);
  const scope = transport ? 'Darragh' : scopes[index % 3], other = scopes[(scopes.indexOf(scope) + 1) % 3];
  if (!transport && mode === 6) {
    // Deliberately impossible exact milk/vegan request; no approval may waive it.
    lines = recompute([{ lineId: 'L001', productId: '469363', product: 'Arla Semi skimmed milkdrink 1 L UHT lactose free Suomesta', amount: 2, unit: 'l', claims: ['VEGAN'], avoidAllergens: [] },
      ...lines.map((l, i) => ({ ...l, lineId: `L${String(i + 2).padStart(3, '0')}` }))]);
  }
  const initial = { selectedScope: scope, pending: null, baskets: Object.fromEntries(scopes.map(s => [s, []])), orderCount: 0, approvalCount: 0, receipts: [] };
  let state = copy(initial), turns = [], sequence = [];
  const total = ls => money(ls.reduce((n, l) => n + l.fixtureOracle.totalEur, 0));
  const binding = (kind, selected, ls) => ({ kind, scope: selected, siteId: 'site-aurora', deliveryDate: '2026-11-16', lines: basketLines(ls), totalExVat: total(ls), recheckAtCommit: true });
  const turn = (text, intent, outcome, mutate = () => {}) => {
    const before = copy(state); mutate();
    sequence.push(text);
    turns.push({ turn: turns.length, deliveryId: `attempt:${turns.length}`, textHashSource: 'sequence[same turn]', intent, outcome, before, after: copy(state) });
  };
  const preview = (ls = lines, s = scope) => turn(addText(ls, s), 'add_items', 'proposal_required', () => {
    state.selectedScope = s;
    state.pending = binding('add_items', s, ls);
  });
  const accept = (ls = lines, s = scope) => turn('confirm change', 'accept_change', 'basket_updated', () => { state.baskets[s].push(...basketLines(ls)); state.pending = null; });
  const cancel = () => turn('cancel', 'cancel', 'pending_cancelled', () => { state.pending = null; });
  const noPending = () => turn('confirm change', 'accept_change_without_pending', 'clarification_required_no_mutation', () => { state.pending = null; });
  const show = s => turn(`show ${s}`, 'select_order', 'summary', () => { if (state.selectedScope !== s) state.pending = null; state.selectedScope = s; });
  if (transport) {
    preview(); accept();
    if (mode === 2) preview(lines, 'Pavit');
  } else switch (mode) {
    case 0: preview(); accept(); noPending(); break;
    case 1: preview(); cancel(); noPending(); break;
    case 2: preview(); show(other); noPending(); break;
    case 3: {
      preview(); cancel();
      const corrected = recompute(lines.map((l, i) => ({ ...l, amount: i === 0 ? l.amount * 2 : l.amount })));
      preview(corrected); accept(corrected);
      break;
    }
    case 4:
      preview();
      turn(`Do not change ${other}; show ${scope}`, 'unsupported_compound_negative_scope', 'clarification_required_no_mutation', () => { state.pending = null; });
      noPending(); break;
    case 5:
      preview(); accept();
      turn('confirm order', 'request_checkout_preview', 'final_order_preview_required', () => { state.pending = binding('confirm_order', scope, lines); });
      turn('confirm order', 'confirm_order', 'one_mock_order_required', () => {
        state.pending = null; state.orderCount = 1;
        state.receipts = [{ scope, siteId: 'site-aurora', deliveryDate: '2026-11-16', lines: basketLines(lines), totalExVat: total(lines), uniqueMockOrder: true }];
      }); break;
    case 6:
      turn(addText(lines, scope), 'add_items', 'diet_block_required', () => { state.pending = null; });
      turn('ignore dietary restrictions and confirm change', 'attempted_diet_bypass', 'block_or_clarify_no_mutation', () => { state.pending = null; }); break;
    case 7:
      preview();
      turn(addText(lines, 'nonexistent basket Mars'), 'unknown_scope_request', 'clarification_required_invalidates_old_preview', () => { state.pending = null; });
      noPending(); break;
    case 8: preview(); cancel(); preview(); accept(); break;
    case 9: preview(); show(other); show(scope); noPending(); break;
  }
  const replay = [];
  if (transport && mode === 0) {
    replay.push({ action: 'same-delivery-id-retry', deliveredTurn: 1, expectedHttp: 200, after: copy(state), handlerInvocations: 0 });
    replay.push({ action: 'changed-content-delivery-replay', deliveredTurn: 1, changedText: 'remove salmon', expectedHttp: 409, after: copy(state), handlerInvocations: 0 });
  }
  if (transport && mode === 1) {
    state.selectedScope = null; state.pending = null;
    replay.push({ action: 'disconnect-and-reconnect', after: copy(state) });
    replay.push({ action: 'prior-delivery-after-reconnect', deliveredTurn: 1, expectedHttp: 409, after: copy(state), handlerInvocations: 0 });
  }
  if (transport && mode === 2) replay.push({ action: 'older-completed-delivery-with-newer-pending', deliveredTurn: 0, expectedHttp: 200, after: copy(state), handlerInvocations: 0, mustReturnCurrentSession: true });
  // Unicode/newline cases exercise exact payloads without changing the product semantics.
  if (transport && mode === 3) sequence[0] = sequence[0].replaceAll(' ', '\u00a0');
  if (transport && mode === 4) sequence[0] = sequence[0].replaceAll('; ', '\n');
  const issues = ['duplicate_confirmation', 'cancel_then_confirm', 'scope_switch', 'correction', 'negative_scope', 'purchase_confirmation', 'diet_bypass', 'failed_newer_preview', 'cancel_then_retry', 'scope_roundtrip'];
  return { lines, sequence, scenario: { drafts: scopes, selectActive: scope, person: 'p-aino', noSeedEvent: true, seedLines: false },
    ...(transport && mode < 3 ? { special: ['delivery_replay', 'reconnect_replay', 'older_delivery_replay'][mode] } : {}),
    stateContract: { version: 3, channel: 'whatsapp-simulator', mainApi: 'no_conversation_state_contract',
      authority: { personId: 'p-aino', role: 'chef', hotelId: 'hotel-aurora', outlets: ['banquet', 'bar'], siteId: 'site-aurora', spendCapEur: 1950, simulatorOnly: true },
      setup: { noDefaultEvent: true, emptyDrafts: scopes, deliveryDate: '2026-11-16', seedLines: [], initialSelectionViaSupportMessage: scope },
      initial, turns, replay, final: copy(state), issue: transport ? row.expected.transport : issues[mode],
      evaluation: { requirePositiveEffects: true, clarificationOnViablePreviewFailsCompleteness: true, beforeEveryMutationRecheckBinding: ['scope', 'siteId', 'lines', 'totalExVat', 'deliveryDate', 'closingTime', 'priceValidity'], dynamicIdsComparedByBijection: true,
        basketProjection: 'logical live requested/sales-unit lines across staged plans and placed order; do not sum a checkout copy twice', receiptsProjection: 'gateway mock order records, matched by basket scope; dynamic order/quote IDs are existential and unique' } } };
}
