import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { Product, type Constraints } from "@aimo/contracts";

process.env.AIMO_DB = ":memory:";
process.env.AIMO_MODE = "fixture";
process.env.AIMO_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.CONTEXT_DEV_API_KEY = "";
process.env.PREVIEW_PASSWORD = "";
const { getProduct, getProductDetails, failsAllergens, searchProducts } = await import("../src/catalog.js");
const { dietRules } = await import("../src/rules/checks.js");
const { editRules } = await import("../src/rules/editor.js");
const { seedReset, OUTSIDE_AGENT_TOKEN } = await import("../src/seed.js");
const { resolveToken, getPerson } = await import("../src/identity.js");
const { createQuote, createApproval, placeOrder } = await import("../src/gateway/service.js");
const { setClock } = await import("../src/clock.js");
const { loadFixture } = await import("../src/aimo/lookup.js");
const { createApp } = await import("../src/server.js");
const { config } = await import("../src/config.js");
const { allJson } = await import("../src/db.js");

const allergy = (codes = ["AN"]): Constraints => ({ claims: [], avoidAllergens: codes, labels: [] });
const biscuit = getProduct("462678")!;
const declared = (patch: Partial<Product> = {}): Product => ({
  ...biscuit, contains: [], mayContain: [], allergenUndeclared: [], hasAllergenData: true, ...patch,
});
const blockedBy = (p: Product, codes = ["AN"]) => dietRules(p, allergy(codes), "allergic guests");

let server: Server;
let base: string;
let cookie: string;
const originalGateway = config.gatewayUrl;
const milk = getProduct("469363")!;
const originalMilkUndeclared = milk.allergenUndeclared;
const fixture = loadFixture("base")!;
const originalAvailability = fixture.availability["462678"];
const originalPrice = fixture.price["462678"];

async function call(method: string, route: string, body?: unknown): Promise<any> {
  const response = await fetch(`${base}/api${route}`, {
    method, headers: { "Content-Type": "application/json", Cookie: cookie ?? "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, ...await response.json() };
}

beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  config.gatewayUrl = `${base}/gateway/v1`;
});
beforeEach(() => {
  seedReset();
  setClock({ scene: "1" });
  // Explicit synthetic supplier fixture: price/stock must not mask the allergy failure.
  fixture.availability["462678"] = {
    productId: "462678", salesBlock: false, logisticModel: "Stock", closingTime: "2026-11-15T17:00:00+0200",
    scheduleLines: [{ salesBlock: false, availableAmount: 100, availableDate: "2026-11-16", salesUnit: "KI" }],
  };
  fixture.price["462678"] = {
    ...fixture.price["469672"], productId: "462678",
    catalogPrice: { ...fixture.price["469672"].catalogPrice, value: 15 },
    comparisonPrice: { ...fixture.price["469672"].comparisonPrice, value: 8 },
  };
});
afterEach(() => {
  milk.allergenUndeclared = originalMilkUndeclared;
  if (originalAvailability) fixture.availability["462678"] = originalAvailability;
  else delete fixture.availability["462678"];
  if (originalPrice) fixture.price["462678"] = originalPrice;
  else delete fixture.price["462678"];
});
afterAll(async () => {
  config.gatewayUrl = originalGateway;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe("explicit UNDECLARED allergy exclusions (Q02.3, R07-01)", () => {
  it("projects the real SKU's undeclared codes consistently without changing its declaration status", () => {
    expect(biscuit).toMatchObject({ hasAllergenData: true, contains: ["AW", "AY", "UW"], allergenUndeclared: expect.arrayContaining(["AN"]) });
    expect(Product.parse(biscuit).allergenUndeclared).toEqual(biscuit.allergenUndeclared);
    expect(getProductDetails(biscuit.id)!.catalogueDetails.allergenUndeclared).toEqual(biscuit.allergenUndeclared);
    expect(blockedBy(biscuit)).toContainEqual(expect.objectContaining({ ruleId: "ALG-04", outcome: "block", overridable: false, facts: expect.objectContaining({ code: "AN" }) }));
    expect(failsAllergens(biscuit, ["AN"])).toBe("undeclared AN");
    expect(searchProducts({ q: "Lotus Biscoff", limit: 50 }).map((p) => p.id)).toContain(biscuit.id);
    expect(searchProducts({ q: "Lotus Biscoff", excludeAllergens: ["AN"], limit: 50 }).map((p) => p.id)).not.toContain(biscuit.id);
  });

  it.each([
    ["contains", "ALG-01", "contains AN"],
    ["mayContain", "ALG-02", "may contain AN"],
    ["allergenUndeclared", "ALG-04", "undeclared AN"],
  ] as const)("keeps %s distinct and blocking", (field, ruleId, reason) => {
    const product = declared({ [field]: ["AN"] });
    expect(blockedBy(product)).toMatchObject([{ ruleId, outcome: "block", overridable: false }]);
    expect(failsAllergens(product, ["AN"])).toBe(reason);
  });

  it.each(["contains", "mayContain", "allergenUndeclared"] as const)("expands nut, milk and gluten families in %s for both shared checks", (field) => {
    for (const [family, member] of [["AN", "SA"], ["AM", "ML"], ["AW", "UW"]]) {
      const product = declared({ [field]: [member] });
      expect(blockedBy(product, [family])).toContainEqual(expect.objectContaining({ outcome: "block", facts: expect.objectContaining({ code: member }) }));
      expect(failsAllergens(product, [family])).toContain(member);
    }
  });

  it("keeps explicit-only undeclared codes distinct from entirely missing declarations", () => {
    const explicitOnly = declared({ hasAllergenData: false, allergenUndeclared: ["AN"] });
    expect(blockedBy(explicitOnly).map((r) => r.ruleId)).toEqual(["ALG-04"]);
    expect(failsAllergens(explicitOnly, ["AN"])).toBe("undeclared AN");
    const missing = declared({ hasAllergenData: false, allergenUndeclared: undefined });
    expect(blockedBy(missing)).toMatchObject([{ ruleId: "ALG-03", outcome: "ask_chef", overridable: true }]);
    expect(failsAllergens(missing, ["AN"])).toBe("no allergen declaration");
  });

  it("accepts unaffected allergies and older Product shapes without inventing free-from data", () => {
    const older = declared({ allergenUndeclared: undefined });
    expect(Product.safeParse(older).success).toBe(true);
    expect(blockedBy(older)).toEqual([]);
    expect(blockedBy(declared({ allergenUndeclared: ["AF"] }))).toEqual([]);
    expect(failsAllergens(declared({ allergenUndeclared: ["AF"] }), ["AN"])).toBeNull();
    expect(dietRules(biscuit, allergy([]), "no allergy")).toEqual([]);
    expect(blockedBy(declared({ contains: ["X99"], allergenUndeclared: ["X99"] }), ["X99"])).toEqual([]);
  });

  it("does not weaken contains/may-contain when the same code is also undeclared", () => {
    expect(blockedBy(declared({ contains: ["AN"], mayContain: ["AN"], allergenUndeclared: ["AN"] }))[0].ruleId).toBe("ALG-01");
    expect(blockedBy(declared({ mayContain: ["AN"], allergenUndeclared: ["AN"] }))[0].ruleId).toBe("ALG-02");
  });

  it("preserves claim-based lactose-free, gluten-free and vegan semantics", () => {
    for (const claim of ["FREE_FROM_LACTOSE", "FREE_FROM_GLUTEN", "VEGAN"]) {
      const product = declared({ claims: [claim], contains: ["AM"], allergenUndeclared: ["ML", "AW", "AN"] });
      expect(dietRules(product, { ...allergy([]), claims: [claim] }, "diet")).toEqual([]);
      expect(dietRules(product, { ...allergy(), claims: [claim] }, "allergy").map((r) => r.ruleId)).toEqual(["ALG-04"]);
    }
    expect(dietRules(declared({ claims: ["FREE_FROM_LACTOSE"], contains: ["ML"] }), { ...allergy([]), claims: ["FREE_FROM_LACTOSE"] }, "diet")[0].ruleId).toBe("DIET-02");
  });

  it("locks the new safety floor against hotel approval-policy changes", () => {
    expect(() => editRules(getPerson("p-sanna")!, { outcomes: { "ALG-04": "ask_chef" } })).toThrow();
    expect(blockedBy(biscuit)[0]).toMatchObject({ ruleId: "ALG-04", outcome: "block", overridable: false });
  });
});

describe("request and gateway enforcement", () => {
  it("parses the actual request, excludes SKU462678 and refuses item approval and staging", async () => {
    cookie = `aimo_session=${(await call("POST", "/session", { personId: "p-aino" })).token}`;
    const parsed = await call("POST", "/messages", { text: "1.875 kg 462678 for tree nut allergy" });
    expect(parsed.status).toBe(200);
    expect(parsed.request.lines[0].constraints.avoidAllergens).toEqual(["AN"]);
    const response = await call("POST", "/requests", {
      eventId: "evt-wedding", reviewing: true, itemReview: true,
      request: { ...parsed.request, neededBy: "2026-11-16" },
    });
    expect(response.status).toBe(200);
    const { plan } = response;
    expect(plan.status).toBe("blocked");
    expect(plan.needs[0].excluded).toContainEqual(expect.objectContaining({ productId: biscuit.id, ruleId: "ALG-04" }));
    expect(plan.needs[0].candidates.map((p: any) => p.productId)).not.toContain(biscuit.id);
    expect(plan.itemReviews[0]).toMatchObject({ canApprove: false, requiresApproval: true, approvedAt: null });
    expect(plan.itemReviews[0].reason).toContain("UNDECLARED");
    expect((await call("POST", `/plans/${plan.id}/items/${plan.itemReviews[0].needId}/approve`, { fingerprint: plan.itemReviews[0].fingerprint })).status).toBe(409);
    expect((await call("POST", `/plans/${plan.id}/basket`, { continueWithWarnings: true })).status).toBe(409);
    const saved = (await call("GET", `/plans/${plan.id}`)).plan;
    expect(saved.request.lines[0].constraints.avoidAllergens).toEqual(["AN"]);
    expect(saved.basketedAt).toBeFalsy();
    expect(saved.orderIds).toEqual([]);
  });

  it("blocks an outside agent's quote and commit for the actual SKU", async () => {
    const identity = resolveToken(OUTSIDE_AGENT_TOKEN)!;
    const quote = await createQuote(identity, {
      siteId: "site-aurora", deliveryDate: "2026-11-16",
      lines: [{ productId: biscuit.id, quantity: 1, outletId: "banquet", requires: allergy() }],
    });
    expect(quote.outcome).toBe("block");
    expect(quote.lines[0].requires?.avoidAllergens).toEqual(["AN"]);
    expect(quote.lines[0].rules).toContainEqual(expect.objectContaining({ ruleId: "ALG-04", outcome: "block", overridable: false }));
    await expect(placeOrder(identity, quote.id, "f20-undeclared-biscuit", "cannot-waive-hard-rule"))
      .rejects.toMatchObject({ body: { error: "hard_rule", rules: expect.arrayContaining([expect.objectContaining({ ruleId: "ALG-04" })]) } });
    expect(allJson("SELECT json FROM orders")).toEqual([]);
  });

  it("can still order the actual SKU without an allergy restriction", async () => {
    const identity = resolveToken(OUTSIDE_AGENT_TOKEN)!;
    const quote = await createQuote(identity, {
      siteId: "site-aurora", deliveryDate: "2026-11-16",
      lines: [{ productId: biscuit.id, quantity: 1, outletId: "banquet" }],
    });
    expect(quote.outcome).toBe("order");
    const result = await placeOrder(identity, quote.id, "f20-unrestricted-biscuit");
    expect(result.order.lines[0].productId).toBe(biscuit.id);
    expect(result.order.state).toBe("placed");
  });

  it("rechecks newly undeclared allergens at commit even after a valid manager approval", async () => {
    const identity = resolveToken(OUTSIDE_AGENT_TOKEN)!;
    const quote = await createQuote(identity, {
      siteId: "site-aurora", deliveryDate: "2026-11-16",
      lines: [{ productId: milk.id, quantity: 5, outletId: "banquet", requires: allergy() }],
    });
    expect(quote.outcome).not.toBe("block");
    const approval = await createApproval({ kind: "person", token: "synthetic-manager", hotelId: "hotel-aurora", person: getPerson("p-sanna")!, testSession: true }, {
      quoteId: quote.id, fingerprint: quote.fingerprint, grants: [],
    });
    // Explicit in-memory catalogue-change fixture; committed product data is untouched.
    milk.allergenUndeclared = ["AN"];
    await expect(placeOrder(identity, quote.id, "f20-undeclared-recheck", approval.id))
      .rejects.toMatchObject({ body: { error: "hard_rule", rules: expect.arrayContaining([expect.objectContaining({ ruleId: "ALG-04", overridable: false })]) } });
    expect(allJson("SELECT json FROM orders")).toEqual([]);
  });
});
