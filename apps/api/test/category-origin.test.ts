import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { Mandate, type Constraints, type PlanLine } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.OPENAI_API_KEY = "";
process.env.AIMO_MODE = "fixture";
process.env.PREVIEW_PASSWORD = "";

const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { seedReset, MANDATE, OUTSIDE_AGENT_TOKEN } = await import("../src/seed.js");
const { setClock } = await import("../src/clock.js");
const { getProduct, allProducts, searchProducts } = await import("../src/catalog.js");
const { getMandate, putMandate, createQuote, placeOrder, amendOrder, getOrder } = await import("../src/gateway/service.js");
const { verifyJwt } = await import("../src/gateway/keys.js");
const { resolveToken, getPerson, issueToken } = await import("../src/identity.js");
const { productRules } = await import("../src/rules/checks.js");
const { requiredOrigins, passesMandateOrigin } = await import("../src/rules/origin.js");
const { editRules } = await import("../src/rules/editor.js");
const { shortlist, rankNeed, matchesCurrentShortlists, matchesSelectedProducts } = await import("../src/agent/match.js");
const { needsFromSingle } = await import("../src/agent/plan.js");
const { rulesParse } = await import("../src/agent/parse.js");
const { lookup } = await import("../src/aimo/lookup.js");

const finnish = getProduct("462016")!;
const norwegian = getProduct("462150")!;
const originalOrigin = finnish.origin;
const empty: Constraints = { claims: [], avoidAllergens: [], labels: [] };
const policy = () => getMandate(MANDATE.hotelId);
const agent = () => resolveToken(OUTSIDE_AGENT_TOKEN)!;
const body = (productId = finnish.id, requires?: Constraints) => ({
  siteId: "site-aurora", deliveryDate: "2026-11-16",
  lines: [{ productId, quantity: 1, outletId: "banquet", ...(requires ? { requires } : {}) }],
});
const request = (productId = finnish.id) => {
  const parsed = rulesParse("5 kg salmon");
  return { ...parsed, siteId: "site-aurora", outletId: "banquet", neededBy: "2026-11-16", lines: parsed.lines.map((l) => ({ ...l, productId })) };
};
function legacyMandate() {
  const { categoryOriginRequirements: _new, signature: _signature, ...old } = policy();
  return old;
}
const originBlock = expect.objectContaining({ ruleId: "ORG-01", outcome: "block", overridable: false });
const refusedOrigin = { body: { error: "hard_rule", rules: expect.arrayContaining([originBlock]) } };

let server: Server;
let base = "";
let chefToken = "";
let managerToken = "";
async function call(method: string, path: string, payload?: unknown, token = OUTSIDE_AGENT_TOKEN) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Cookie: `aimo_session=${token}`, "Idempotency-Key": "origin-http-test" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() as any };
}

beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
beforeEach(() => {
  seedReset();
  setClock({ time: "2026-11-14T10:00:00Z" });
  chefToken = issueToken({ kind: "person", personId: "p-aino" });
  managerToken = issueToken({ kind: "person", personId: "p-sanna" });
  const nativeFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    if (!String(input).startsWith(`${base}/`)) throw new Error("Origin regression must use saved supplier evidence, without external calls");
    return nativeFetch(input, init);
  });
});
afterEach(() => { finnish.origin = originalOrigin; vi.restoreAllMocks(); });
afterAll(() => server.close());

describe("signed category-scoped mandate", () => {
  it("round-trips the requirement and binds every category and origin into the signature", async () => {
    const response = await call("GET", "/gateway/v1/mandate");
    expect(response.status).toBe(200);
    const m = Mandate.parse(JSON.parse(JSON.stringify(response.body)));
    const { signature, ...unsigned } = m;
    expect(verifyJwt(signature!, "aimo-mandate+jwt")?.mandate).toEqual(unsigned);
    expect(m.categoryOriginRequirements).toEqual(MANDATE.categoryOriginRequirements);
    const [header, encoded, sig] = signature!.split(".");
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    claims.mandate.categoryOriginRequirements[0].origin = "no";
    expect(verifyJwt(`${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${sig}`, "aimo-mandate+jwt")).toBeNull();
    const changed = putMandate({ ...m, categoryOriginRequirements: [{ origin: "fi", categories: ["18701"] }], version: 2 });
    expect(changed.signature).not.toBe(signature);
    expect(verifyJwt(changed.signature!, "aimo-mandate+jwt")?.mandate.categoryOriginRequirements).toEqual(changed.categoryOriginRequirements);
  });

  it("leaves the legacy signature payload and policy unchanged when the optional field is absent", async () => {
    const old = legacyMandate();
    expect(Mandate.parse(old)).not.toHaveProperty("categoryOriginRequirements");
    const signed = putMandate(Mandate.parse(old));
    expect(verifyJwt(signed.signature!, "aimo-mandate+jwt")?.mandate).toEqual(old);
    const q = await createQuote(agent(), body(norwegian.id));
    expect(q.outcome).toBe("order");
    const { order } = await placeOrder(agent(), q.id, "legacy-order");
    expect(order.lines[0].productId).toBe(norwegian.id);
    expect((await amendOrder(agent(), order.id, { changes: [{ productId: norwegian.id, outletId: "banquet", quantity: 2 }] })).order.version).toBe(2);
  });

  it("rejects prefix scopes and invalid country codes; regular Rules edits preserve the signed scope", () => {
    expect(Mandate.safeParse({ ...MANDATE, categoryOriginRequirements: [{ categories: ["187"], origin: "fi" }] }).success).toBe(false);
    expect(Mandate.safeParse({ ...MANDATE, categoryOriginRequirements: [{ categories: ["18701"], origin: "Finland" }] }).success).toBe(false);
    editRules(getPerson("p-sanna")!, { params: { spendCapEur: 2000 } });
    expect(policy().categoryOriginRequirements).toEqual(MANDATE.categoryOriginRequirements);
    expect(verifyJwt(policy().signature!, "aimo-mandate+jwt")?.mandate.categoryOriginRequirements).toEqual(MANDATE.categoryOriginRequirements);
  });
});

describe("category boundaries and effective constraints", () => {
  it("matches exact codes from catalogue evidence, including fish with no allergen declaration", () => {
    expect(policy().categoryOriginRequirements![0].categories).toEqual(["18701", "18702", "18706", "18707", "18708", "41720", "41722"]);
    for (const category of policy().categoryOriginRequirements![0].categories) {
      const records = allProducts().filter((p) => p.category === category);
      expect(records.length).toBeGreaterThan(0);
      expect(requiredOrigins(records[0], policy())).toEqual(["fi"]);
    }
    const undeclaredFish = getProduct("462361")!;
    expect(undeclaredFish.hasAllergenData).toBe(false);
    expect(passesMandateOrigin(undeclaredFish, policy())).toBe(false);
    for (const category of ["187", "187010", "18703", "18704", "18705", "18710", "18720", "41721", "41723", "10400", "85028", "17300", ""]) {
      expect(passesMandateOrigin({ category, origin: "no" }, policy()), category).toBe(true);
    }
    // The mixed buckets also contain octopus, meat timbales and vegan burgers.
    // A fish policy must not restrict unrelated foods through their category.
    for (const productId of ["462557", "461743", "461754", "468987"]) {
      expect(requiredOrigins(getProduct(productId)!, policy()), productId).toEqual([]);
    }
    expect(passesMandateOrigin(finnish, { categoryOriginRequirements: [] })).toBe(true);
  });

  it("keeps request origins, claims, labels and allergens alongside the standing rule", () => {
    const c: Constraints = { origin: "no", claims: ["VEGAN"], avoidAllergens: ["AF"], labels: ["MSC"] };
    const original = structuredClone(c);
    const finnishRules = productRules(finnish, c, "request", policy());
    expect(finnishRules).toContainEqual(expect.objectContaining({ ruleId: "ORG-01", facts: expect.objectContaining({ required: "no" }) }));
    expect(finnishRules.map((r) => r.ruleId)).toEqual(expect.arrayContaining(["DIET-01", "ALG-03", "LBL-01"]));
    expect(productRules(norwegian, { ...empty, origin: "no" }, "request", policy())).toContainEqual(originBlock);
    expect(c).toEqual(original);
    const overlapping = { categoryOriginRequirements: [{ categories: [finnish.category], origin: "fi" }, { categories: [finnish.category], origin: "no" }] };
    expect(passesMandateOrigin(finnish, overlapping)).toBe(false);
    expect(passesMandateOrigin(norwegian, overlapping)).toBe(false);
  });

  it("blocks unknown origin even when recipe-level ORG-01 asks the chef", () => {
    editRules(getPerson("p-sanna")!, { outcomes: { "ORG-01": "ask_chef" } });
    for (const origin of [null, "", "no"]) {
      expect(productRules({ ...finnish, origin }, empty, "request", policy())).toContainEqual(originBlock);
    }
  });
});

describe("search, ranking and staged selections", () => {
  it("filters before limits, keys cached searches by policy and preserves stricter search filters", async () => {
    const q = { q: "fillet", category: "18706", limit: 50 };
    expect(searchProducts(q).map((p) => p.id)).toContain(norwegian.id);
    expect(searchProducts(q, policy()).map((p) => p.id)).toEqual([finnish.id]);
    expect(searchProducts({ ...q, limit: 1 }, policy()).map((p) => p.id)).toEqual([finnish.id]);
    expect(searchProducts({ ...q, origin: "no" }, policy())).toEqual([]);
    expect(searchProducts(q).map((p) => p.id)).toContain(norwegian.id);
    const response = await call("GET", "/gateway/v1/products?category=18706&limit=1");
    expect(response.body.products.map((p: any) => p.id)).toEqual([finnish.id]);
    expect((await call("GET", "/gateway/v1/products?category=18706&origin=no")).body.products).toEqual([]);
    expect(searchProducts({ category: "10400", limit: 50 }, policy())).toEqual(searchProducts({ category: "10400", limit: 50 }));
    expect(searchProducts({ category: "85028", limit: 50 }, policy())).toEqual(searchProducts({ category: "85028", limit: 50 }));
  });

  it("excludes explicit non-Finnish SKUs while retaining a clear ORG-01 reason", async () => {
    const need = needsFromSingle(request(norwegian.id))[0];
    const evidence = await lookup([finnish.id, norwegian.id], "2026-11-16");
    await rankNeed(need, [finnish, norwegian], new Map(evidence.lines.map((l) => [l.productId, l])));
    expect(need.rules).toContainEqual(originBlock);
    expect(need.excluded).toContainEqual(expect.objectContaining({ productId: norwegian.id, ruleId: "ORG-01" }));
    expect(need.candidates.map((c) => c.productId)).toContain(finnish.id);
    expect(need.candidates.map((c) => c.productId)).not.toContain(norwegian.id);
    const automatic = { ...need, pinnedProductId: null, category: "18706" };
    expect(shortlist(automatic).every((p) => p.origin === "fi")).toBe(true);
    const selected = [{ productId: norwegian.id, needIds: [need.id], removed: false }] as PlanLine[];
    expect(matchesSelectedProducts([need], selected)).toBe(false);
    expect(matchesCurrentShortlists([need], selected)).toBe(false);
  });

  it.each([false, true])("refuses stale fish selections before staging or final review (staged=%s)", async (staged) => {
    const basket = await call("POST", "/api/baskets", { name: "Origin regression", deliveryDate: "2026-11-16" }, chefToken);
    const result = await call("POST", "/api/requests", { request: request(), eventId: basket.body.basket.id, reviewing: true }, chefToken);
    expect(result.status).toBe(200);
    const path = `/api/plans/${result.body.plan.id}/basket`;
    if (staged) expect((await call("POST", path, { continueWithWarnings: true }, chefToken)).status).toBe(200);
    finnish.origin = null; // Synthetic catalogue drift fixture, restored after each test.
    const refused = staged
      ? await call("POST", `/api/baskets/${basket.body.basket.id}/submit-review`, {}, chefToken)
      : await call("POST", path, { continueWithWarnings: true }, chefToken);
    expect(refused.status).toBe(409);
  });
});

describe("independent gateway enforcement", () => {
  it("places Finnish qualifying fish using saved stock and returns one order on retry", async () => {
    const q = await createQuote(agent(), body());
    expect(q.outcome).toBe("order");
    expect(q.lines[0].source).toBe("fixture");
    const placed = await placeOrder(agent(), q.id, "finnish-order");
    expect(placed.order.lines[0].productId).toBe(finnish.id);
    expect((await placeOrder(agent(), q.id, "finnish-order")).order.id).toBe(placed.order.id);
  });

  it.each(["omitted", "conflicting", "unknown"])("blocks direct SKU quotes, commit and manager approval (requires: %s)", async (scenario) => {
    if (scenario === "unknown") finnish.origin = null; // Synthetic missing-origin fixture.
    const q = await call("POST", "/gateway/v1/quotes", body(
      scenario === "unknown" ? finnish.id : norwegian.id,
      scenario === "conflicting" ? { ...empty, origin: "no" } : undefined,
    ));
    expect(q.status).toBe(201);
    expect(q.body.outcome).toBe("block");
    expect(q.body.lines[0].rules).toContainEqual(originBlock);
    const placed = await call("POST", "/gateway/v1/orders", { quoteId: q.body.id });
    expect(placed.status).toBe(409);
    expect(placed.body).toMatchObject(refusedOrigin.body);
    const approval = await call("POST", "/gateway/v1/approvals", { quoteId: q.body.id, fingerprint: q.body.fingerprint, grants: [] }, managerToken);
    expect(approval.status).toBe(409);
  });

  it.each([null, "no"])("rechecks catalogue origin at commit (%s)", async (origin) => {
    const q = await createQuote(agent(), body());
    finnish.origin = origin; // Synthetic catalogue drift fixture.
    await expect(placeOrder(agent(), q.id, "origin-drift")).rejects.toMatchObject(refusedOrigin);
  });

  it("checks the current mandate for legacy quotes lacking requires", async () => {
    putMandate(legacyMandate());
    const q = await createQuote(agent(), body(norwegian.id));
    expect(q.lines[0].requires).toBeUndefined();
    putMandate(MANDATE);
    await expect(placeOrder(agent(), q.id, "new-policy")).rejects.toMatchObject(refusedOrigin);
  });

  it.each(["foreign addition", "unknown retained line", "new mandate"])("enforces amendments: %s", async (scenario) => {
    if (scenario === "new mandate") putMandate(legacyMandate());
    const id = scenario === "new mandate" ? norwegian.id : finnish.id;
    const q = await createQuote(agent(), body(id));
    const { order } = await placeOrder(agent(), q.id, "before-amendment");
    if (scenario === "unknown retained line") finnish.origin = null; // Synthetic catalogue drift fixture.
    if (scenario === "new mandate") putMandate(MANDATE);
    const change = { productId: scenario === "foreign addition" ? norwegian.id : scenario === "unknown retained line" ? "469363" : id, outletId: "banquet", quantity: scenario === "new mandate" ? 2 : 1 };
    await expect(amendOrder(agent(), order.id, { changes: [change] })).rejects.toMatchObject(refusedOrigin);
    expect(getOrder(order.id).version).toBe(1);
  });

  it("allows a qualifying Finnish fish amendment", async () => {
    const q = await createQuote(agent(), body());
    const { order } = await placeOrder(agent(), q.id, "finnish-amendment");
    const amended = await amendOrder(agent(), order.id, { changes: [{ productId: finnish.id, outletId: "banquet", quantity: 2 }] });
    expect(amended.order.version).toBe(2);
    expect(amended.order.lines[0].quantity).toBe(2);
  });
});
