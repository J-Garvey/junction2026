/** Small independent HTTP smoke only; never substitutes for E3's campaign. */
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function smokeCases() {
  const quote = (productId, quantity = 1, requires) => ({ siteId: 'site-aurora', deliveryDate: '2026-11-16', lines: [{ productId, quantity, outletId: 'banquet', ...(requires ? { requires } : {}) }] });
  const q = body => ({ path: '/gateway/v1/quotes', body, saveAs: 'quote' });
  const ref = key => ({ $ref: `quote.${key}` });
  const order = (key, extra = {}) => ({ path: '/gateway/v1/orders', body: { quoteId: ref('id'), ...extra }, headers: { 'Idempotency-Key': key } });
  const row = (caseId, input, expected, extra = {}) => ({ caseId, input, expected: { oracle: 'independent smoke authored before requests', ...expected }, split: 'E1-smoke', primaryCategory: caseId, ...extra });
  return [
    row('smoke-web-parse-plan', '2 kg salmon 469672 by 2026-11-16', { lines: [{ productId: '469672', amount: 2, unit: 'kg' }], noOrderBeforeConfirmation: true }, { channels: ['web-api', 'gateway'], plan: true, itemCount: 1 }),
    row('smoke-web-oversize', 'x'.repeat(2001), { status: 422, mustNotOrder: true }, { channel: 'web-api', itemCount: 0 }),
    row('smoke-simulator-oversize', 'x'.repeat(8001), { status: 400, mustNotOrder: true }, { channel: 'whatsapp', itemCount: 0 }),
    row('smoke-gateway-order-retry', 'explicit fixed-price salmon order and same-key retry', { statuses: [201, 201, 200], orders: 1, approvals: 0 }, { channel: 'gateway', sequence: [q(quote('469672')), order('E1-smoke-retry'), order('E1-smoke-retry')] }),
    row('smoke-gateway-approval', 'explicit above-cap order with scoped approval', { orders: 1, approvals: 1, noOrderBeforeApproval: true }, { channel: 'gateway', sequence: [
      q(quote('469672', 100)), order('E1-smoke-approval'),
      { path: '/gateway/v1/approvals', auth: 'approver', body: { quoteId: ref('id'), fingerprint: ref('fingerprint'), grants: ['spend_cap'] }, saveAs: 'approval' },
      order('E1-smoke-approval', { approvalId: { $ref: 'approval.id' } }),
    ] }),
    row('smoke-gateway-allergen-block', 'milk avoidance is not lactose freedom', { outcome: 'block', mustNotOrder: true, mustNotApprove: true }, { channel: 'gateway', sequence: [
      q(quote('469363', 1, { avoidAllergens: ['AM'] })),
      { path: '/gateway/v1/approvals', auth: 'approver', body: { quoteId: ref('id'), fingerprint: ref('fingerprint'), grants: [] } }, order('E1-smoke-allergen'),
    ] }),
    row('smoke-gateway-expired-cutoff', 'saved terminal fixture has an already-passed cutoff', { outcome: 'block', orders: 0 }, { channel: 'gateway', sequence: [q(quote('477125')), order('E1-smoke-cutoff')] }),
    row('smoke-gateway-unknown-stock', 'unconfirmed stock needs explicit chef continuation', { unconfirmedStock: ['464306'], orders: 0 }, { channel: 'gateway', sequence: [q(quote('464306')), order('E1-smoke-unknown')] }),
    row('smoke-gateway-fixture-miss', { path: '/gateway/v1/lookup', body: { productIds: ['999999'], requestedDate: '2026-11-16' } }, { status: 503, upstreamTraffic: 0 }, { channel: 'gateway' }),
    row('smoke-web-real-transport-guard', { path: '/api/whatsapp/web/connect', body: {} }, { status: 403, browserStarted: false }, { channel: 'web-api' }),
    row('smoke-gateway-quote-limit', { path: '/gateway/v1/quotes', body: { siteId: 'site-aurora', deliveryDate: '2026-11-16', lines: Array.from({ length: 1001 }, () => ({ productId: '469672', quantity: 1, outletId: 'banquet' })) } }, { status: 422, mustNotOrder: true }, { channel: 'gateway', itemCount: 1001 }),
    row('smoke-gateway-lookup-limit', { path: '/gateway/v1/lookup', body: { productIds: Array(5001).fill('469672'), requestedDate: '2026-11-16' } }, { status: 422, mustNotOrder: true }, { channel: 'gateway', itemCount: 5001 }),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw Error('Supply an external smoke JSONL output path');
  writeFileSync(process.argv[2], smokeCases().map(c => JSON.stringify(c)).join('\n') + '\n', { flag: 'wx' });
}
