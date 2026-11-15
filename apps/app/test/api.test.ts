import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, authHooks } from "../src/api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("shared API client", () => {
  it("reports an unreachable receipts read without denying existing orders", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetch);

    const error = await api.orders().catch((error: unknown) => error);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, message: "Can't reach the server right now." });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/orders", expect.objectContaining({ method: "GET", credentials: "same-origin" }));
  });

  it.each([
    ["POST", () => api.answer("review", "approve")],
    ["PUT", () => api.saveRules({})],
  ] as const)("does not claim a failed %s response means nothing committed or retry it", async (method, mutate) => {
    let committed = 0;
    const fetch = vi.fn().mockImplementation(async () => {
      committed++;
      throw new TypeError("Response lost after commit");
    });
    vi.stubGlobal("fetch", fetch);

    await expect(mutate()).rejects.toMatchObject({ status: 0, message: "Can't reach the server right now." });

    expect(committed).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method, credentials: "same-origin" }));
  });

  it("preserves cancellation and passes the AbortSignal to fetch", async () => {
    const controller = new AbortController();
    const abort = new DOMException("Cancelled", "AbortError");
    const fetch = vi.fn().mockRejectedValue(abort);
    vi.stubGlobal("fetch", fetch);
    controller.abort();

    await expect(api.prepareMessage("milk", controller.signal)).rejects.toBe(abort);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/messages/prepare", expect.objectContaining({ signal: controller.signal }));
  });

  it("preserves HTTP errors and their response body", async () => {
    const body = { reason: "Supplier terms changed", question: { id: "review" } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status: 409 })));

    const error = await api.answer("review", "approve").catch((error: unknown) => error);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, body, message: body.reason });
  });

  it("still opens the person picker for an unauthorized session", async () => {
    const onUnauthorized = vi.spyOn(authHooks, "onUnauthorized");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Sign in" }, { status: 401 })));

    await expect(api.orders()).rejects.toMatchObject({ status: 401, message: "Sign in" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("still redirects preview-gate failures to login", async () => {
    const onUnauthorized = vi.spyOn(authHooks, "onUnauthorized");
    const location = { href: "/orders" };
    vi.stubGlobal("window", { location });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "X-Preview-Password required" }, { status: 401 })));

    await expect(api.orders()).rejects.toMatchObject({ status: 401 });
    expect(location.href).toBe("/login");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
