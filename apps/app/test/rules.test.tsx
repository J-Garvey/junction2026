// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { api, type ParamDef, type ParamValue, type RuleDef, type RulesResp } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { Rules } from "../src/screens/Rules";

const definitions: ParamDef[] = [
  { key: "spendCapEur", scope: "mandate", label: "Spend cap per order", kind: "eur" },
  { key: "blockedProducts", scope: "mandate", label: "Blocked product codes", kind: "products" },
  { key: "deliveryDays", scope: "mandate", label: "Delivery days", kind: "weekdays" },
  { key: "holidays", scope: "mandate", label: "No delivery on", kind: "dates" },
  { key: "unknownStockMaxLineEur", scope: "mandate", label: "Continue without asking up to", kind: "eur", nullLabel: "Always ask" },
  { key: "priceRiseMaxPct", scope: "mandate", label: "Accept price rises up to", kind: "pct" },
  { key: "reliabilityAsk", scope: "policy", label: "Ask when reliability is below", kind: "fraction" },
  { key: "silenceFlagsValioAimo", scope: "policy", label: "Also flag the line to Valio Aimo", kind: "bool" },
];
const defaultParams: Record<string, ParamValue> = {
  spendCapEur: 1950, blockedProducts: [], deliveryDays: [1, 2, 3, 4, 5], holidays: ["2026-12-25"],
  unknownStockMaxLineEur: null, priceRiseMaxPct: 5, reliabilityAsk: 0.8, silenceFlagsValioAimo: true,
};
const rule = (id: string, params: string[], outcome: RuleDef["outcome"] = "ask_approver"): RuleDef => ({
  id, area: "Hotel", label: id, outcome, defaultOutcome: outcome, hard: false, who: "hotel", trigger: id, template: id,
  control: { choices: [outcome, "block"], params },
});
const baseline = (): RulesResp => ({
  rules: [rule("MAN-01", ["spendCapEur"]), rule("MAN-02", ["blockedProducts"]), rule("DLV-04", ["deliveryDays", "holidays"], "order"),
    rule("STK-01", ["unknownStockMaxLineEur"], "ask_chef"), rule("PRC-03", ["priceRiseMaxPct"]),
    rule("REL-02", ["reliabilityAsk"]), rule("SIL-01", ["silenceFlagsValioAimo"], "order")],
  params: Object.fromEntries(definitions.map((d) => [d.key, d])), defaultParams: structuredClone(defaultParams),
  mandate: {
    id: "mandate", type: "aimo.mandate.standing.1", hotelId: "hotel", customerNumber: "123", version: 1, sites: [],
    spendCapEur: 1950, blockedProducts: [], deliveryDays: [1, 2, 3, 4, 5], holidays: ["2026-12-25"],
    preAnswers: { unknownStockMaxLineEur: null, partialFillMaxShortPct: null, overshootMaxPct: 10, overshootMaxEur: 25, priceRiseMaxPct: 5, guestChangeMaxPct: 5 },
  },
  policy: { params: { reliabilityAsk: 0.8, silenceFlagsValioAimo: true }, version: 0, updatedBy: null, updatedAt: null },
  canEdit: true, fixed: {}, remembered: [], tokens: { outsideAgent: "fixture", valioViewer: "fixture" },
});
const context: AppCtx = {
  me: { id: "p-jonas", name: "Jonas", title: "F&B director", role: "approver", hotelScope: true, outlets: [] },
  people: [], outlets: [], status: null, now: "2026-11-14T10:00:00Z", tick: 0, refresh: vi.fn(), switchPerson: vi.fn(),
};
let stored: RulesResp;
function setStored(key: string, value: ParamValue) {
  if (stored.params[key].scope === "policy") stored.policy.params[key] = value;
  else if (key in stored.mandate.preAnswers) (stored.mandate.preAnswers as Record<string, ParamValue>)[key] = value;
  else (stored.mandate as unknown as Record<string, ParamValue>)[key] = value;
}
const mount = () => render(<Ctx.Provider value={context}><Rules /></Ctx.Provider>);
const emptyMessage = () => screen.queryByText("No rules changed from the defaults.");
const pending = () => screen.queryByRole("region", { name: "Unsaved rule changes" });
const row = (id: string) => screen.queryAllByText(id).find((el) => el.classList.contains("mono"))?.closest(".rulerow") as HTMLElement | undefined;
async function selectChanged(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("heading", { name: "Rules" });
  await user.click(screen.getByRole("tab", { name: "Changed" }));
}
async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Save rules" }));
  await waitFor(() => expect(pending()).toBeNull());
}

beforeEach(() => {
  stored = baseline();
  vi.spyOn(api, "rules").mockImplementation(async () => structuredClone(stored));
  vi.spyOn(api, "saveRules").mockImplementation(async (edit) => {
    for (const [key, value] of Object.entries(edit.params ?? {})) setStored(key, value);
    for (const [id, outcome] of Object.entries(edit.outcomes ?? {})) stored.rules.find((r) => r.id === id)!.outcome = outcome;
    stored.policy.updatedBy = "Jonas";
    stored.policy.updatedAt = context.now;
    return { ...structuredClone(stored), changes: ["Fixture rules saved"] };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Rules changed filter", () => {
  it("starts empty when all effective values match the canonical defaults", async () => {
    const user = userEvent.setup();
    mount();
    await selectChanged(user);
    expect(emptyMessage()).toBeTruthy();
    expect(pending()).toBeNull();
  });

  it("keeps the saved reliability threshold and blocked text code visible after saving and reloading", async () => {
    const user = userEvent.setup();
    const page = mount();
    const threshold = await screen.findByRole("spinbutton", { name: "Ask when reliability is below" });
    await user.clear(threshold);
    await user.type(threshold, "85");
    await user.type(screen.getAllByRole("textbox", { name: "Add to Blocked product codes" })[0], "469363{Enter}");
    await selectChanged(user);
    expect(row("REL-02")).toBeTruthy();
    expect(row("MAN-02")).toBeTruthy();
    await save(user);
    expect(api.saveRules).toHaveBeenCalledWith({ outcomes: {}, params: { reliabilityAsk: 0.85, blockedProducts: ["469363"] } });
    expect(emptyMessage()).toBeNull();
    expect(within(row("REL-02")!).getByText("Changed")).toBeTruthy();
    expect(within(row("MAN-02")!).getByText("469363")).toBeTruthy();
    expect(document.querySelectorAll(".pfield.dirty")).toHaveLength(0);
    page.unmount();
    mount();
    await selectChanged(user);
    expect((within(row("REL-02")!).getByRole("spinbutton") as HTMLInputElement).value).toBe("85");
    expect(within(row("MAN-02")!).getByText("469363")).toBeTruthy();
    expect(pending()).toBeNull();
    // Returning the text list to its default is still unsaved, but no longer non-default.
    await user.click(within(row("MAN-02")!).getByRole("button", { name: "Remove 469363" }));
    expect(row("MAN-02")).toBeUndefined();
    expect(pending()).toBeTruthy();
  });

  it.each([
    ["spendCapEur", "MAN-01", 2100, "1950"],
    ["priceRiseMaxPct", "PRC-03", 10, "5"],
    ["reliabilityAsk", "REL-02", 0.85, "80"],
  ] as const)("compares saved %s with defaults and lets a draft restore it without confusing pending state", async (key, id, savedValue, defaultText) => {
    setStored(key, savedValue);
    const user = userEvent.setup();
    const page = mount();
    await selectChanged(user);
    expect(row(id)).toBeTruthy();
    expect(pending()).toBeNull();
    const restore = async () => {
      const input = within(row(id)!).getByRole("spinbutton");
      await user.clear(input);
      await user.type(input, defaultText);
    };
    await restore();
    expect(row(id)).toBeUndefined();
    expect(emptyMessage()).toBeTruthy();
    expect(pending()).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(row(id)).toBeTruthy();
    expect(pending()).toBeNull();
    await restore();
    await save(user);
    page.unmount();
    mount();
    await selectChanged(user);
    expect(emptyMessage()).toBeTruthy();
    expect(pending()).toBeNull();
  });

  it("recognizes saved false, nullable limits and calendar lists, including restored-default drafts", async () => {
    setStored("silenceFlagsValioAimo", false);
    setStored("unknownStockMaxLineEur", 100);
    setStored("holidays", ["2026-12-25", "2026-12-26"]);
    setStored("deliveryDays", [1, 2, 3, 4]);
    const user = userEvent.setup();
    mount();
    await selectChanged(user);
    expect(["SIL-01", "STK-01", "DLV-04"].every((id) => row(id))).toBe(true);
    await user.click(within(row("SIL-01")!).getByRole("checkbox"));
    await user.click(within(row("STK-01")!).getByRole("checkbox", { name: "Always ask" }));
    await user.click(within(row("DLV-04")!).getByRole("checkbox", { name: "Fri" }));
    await user.click(within(row("DLV-04")!).getByRole("button", { name: "Remove 2026-12-26" }));
    expect(emptyMessage()).toBeTruthy();
    expect(pending()).toBeTruthy();
    await save(user);
    expect(api.saveRules).toHaveBeenCalledWith({ outcomes: {}, params: {
      silenceFlagsValioAimo: true, unknownStockMaxLineEur: null, deliveryDays: [1, 2, 3, 4, 5], holidays: ["2026-12-25"],
    } });
    expect(emptyMessage()).toBeTruthy();
  });

  it("retains saved outcome changes and removes restored-default outcomes from Changed", async () => {
    const user = userEvent.setup();
    const page = mount();
    await screen.findByRole("heading", { name: "Rules" });
    await user.click(within(row("REL-02")!).getByRole("radio", { name: "Block" }));
    await selectChanged(user);
    await save(user);
    expect(row("REL-02")).toBeTruthy();
    page.unmount();
    mount();
    await selectChanged(user);
    expect(within(row("REL-02")!).getByRole("radio", { name: "Block" }).getAttribute("aria-checked")).toBe("true");
    await user.click(within(row("REL-02")!).getByRole("radio", { name: "Ask approver" }));
    expect(emptyMessage()).toBeTruthy();
    expect(pending()).toBeTruthy();
    await save(user);
    expect(emptyMessage()).toBeTruthy();
  });
});
