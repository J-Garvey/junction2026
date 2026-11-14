export {};
/**
 * An outside purchasing agent that knows only the published spec (/openapi.json)
 * and its scoped token. It searches, quotes and orders, and shows the gateway's
 * refusals: over the spend cap, a past cut-off, and a retried order.
 *
 *   GATEWAY=http://127.0.0.1:8787 pnpm agent:demo
 */
const BASE = (process.env.GATEWAY ?? "http://127.0.0.1:8787") + "/gateway/v1";
const TOKEN = process.env.AGENT_TOKEN ?? "agent_demo_hotel_aurora";
const PREVIEW: Record<string, string> = process.env.PREVIEW_PASSWORD ? { "X-Preview-Password": process.env.PREVIEW_PASSWORD } : {};

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...PREVIEW, ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: (await res.json()) as any };
}
const log = (title: string, v: unknown) => console.log(`\n== ${title}\n${typeof v === "string" ? v : JSON.stringify(v, null, 1).slice(0, 900)}`);

const spec = await (await fetch(BASE + "/openapi.json", { headers: PREVIEW })).json();
log("Spec", `${spec.info.title} ${spec.info.version}: ${Object.keys(spec.paths).join(", ")}`);

const search = await call("GET", "/products?category=10400&claims=FREE_FROM_LACTOSE&limit=50");
log("Search lactose-free milks", `${search.body.products.length} products`);

const mandate = await call("GET", "/mandate");
const site = mandate.body.sites[0].id;
log("Mandate", { spendCapEur: mandate.body.spendCapEur, site, signed: Boolean(mandate.body.signature) });

const delivery = "2026-11-16";
const q1 = await call("POST", "/quotes", { siteId: site, deliveryDate: delivery, lines: [{ productId: "469363", quantity: 40, outletId: "banquet" }] });
log("Quote: 40 × Arla lactose-free milk (real stock)", { id: q1.body.id, total: q1.body.totalExVat, outcome: q1.body.outcome, expiresAt: q1.body.expiresAt, approvalsNeeded: q1.body.mandateCheck.approvalsNeeded });

const key = `outside-${q1.body.id}`;
const o1 = await call("POST", "/orders", { quoteId: q1.body.id }, { "Idempotency-Key": key });
log(`Order (HTTP ${o1.status})`, { id: o1.body.id, state: o1.body.state, total: o1.body.totalExVat });
const o2 = await call("POST", "/orders", { quoteId: q1.body.id }, { "Idempotency-Key": key });
log(`Same order retried (HTTP ${o2.status})`, { sameOrder: o2.body.id === o1.body.id });
const o3 = await call("POST", "/orders", { quoteId: q1.body.id, approvalId: "apr_other" }, { "Idempotency-Key": key });
log(`Same key, different body (HTTP ${o3.status})`, o3.body);

const q2 = await call("POST", "/quotes", { siteId: site, deliveryDate: delivery, lines: [{ productId: "469363", quantity: 380, outletId: "banquet" }, { productId: "464727", quantity: 30, outletId: "banquet" }, { productId: "471555", quantity: 400, outletId: "banquet" }] });
log("Quote over the €5,000 cap", { id: q2.body.id, total: q2.body.totalExVat, approvalsNeeded: q2.body.mandateCheck.approvalsNeeded });
const o4 = await call("POST", "/orders", { quoteId: q2.body.id }, { "Idempotency-Key": `outside-${q2.body.id}` });
log(`Order without approval (HTTP ${o4.status})`, o4.body);
const a = await call("POST", "/approvals", { quoteId: q2.body.id, fingerprint: q2.body.fingerprint, grants: ["spend_cap"] });
log(`Agent tries to approve itself (HTTP ${a.status})`, a.body);

const q3 = await call("POST", "/quotes", { siteId: site, deliveryDate: delivery, lines: [{ productId: "463038", quantity: 5, outletId: "banquet" }] });
log("Quote: Terminal milk whose cut-off has passed", { outcome: q3.body.outcome, rules: q3.body.lines?.[0]?.rules.map((r: any) => `${r.ruleId}: ${r.message}`) });
const o5 = await call("POST", "/orders", { quoteId: q3.body.id }, { "Idempotency-Key": `outside-${q3.body.id}` });
log(`Order on it (HTTP ${o5.status})`, o5.body);

const audit = await call("GET", `/audit?orderId=${o1.body.id}`);
log("Audit for the first order", audit.body.entries.map((e: any) => `${e.action}: ${e.summary}`));
