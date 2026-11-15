// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "../src/App";
import { api, type HomeResp, type Person, type StatusResp } from "../src/api";
import { Ctx, type AppCtx } from "../src/ctx";
import { Home } from "../src/screens/Home";
import { Requests } from "../src/screens/Request";
import { Events } from "../src/screens/Event";

const chef: Person = { id: "aino", name: "Aino", title: "Head chef", role: "chef", outlets: ["banquet"], hotelScope: false };
const status: StatusResp = {
  clock: { mode: "fixed", time: null, scene: "1", now: "2026-11-15T10:00:00Z", scenes: {} as StatusResp["clock"]["scenes"] },
  dataMode: "fixture", model: { provider: "openai", model: "demo", configured: false }, chain: { ok: true, brokenAt: null, entries: 0 },
};
const emptyHome: HomeResp = { questions: [], events: [], plans: [], warnings: [] };
const context: AppCtx = { me: chef, people: [chef], outlets: [], status, now: status.clock.now, tick: 0, refresh: vi.fn(), switchPerson: vi.fn() };
function show(children: React.ReactNode, tick = 0) {
  return <MemoryRouter><Ctx.Provider value={{ ...context, tick }}>{children}</Ctx.Provider></MemoryRouter>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.spyOn(api, "people").mockResolvedValue({ people: [chef], outlets: [] });
  vi.spyOn(api, "me").mockResolvedValue({ person: chef });
  vi.spyOn(api, "status").mockResolvedValue(status);
  vi.spyOn(api, "home").mockResolvedValue(emptyHome);
  vi.spyOn(api, "baskets").mockResolvedValue({ baskets: [] });
  vi.spyOn(api, "events").mockResolvedValue({ events: [] });
  vi.spyOn(api, "prepareMessage").mockResolvedValue({ ok: true });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("read failures and recovery", () => {
  it("offers a keyboard-accessible reload after people bootstrap fails and starts once restored", async () => {
    const user = userEvent.setup();
    vi.mocked(api.people).mockRejectedValueOnce(new Error("People could not be loaded."));
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
    render(<MemoryRouter><App /></MemoryRouter>);
    await screen.findByText("People could not be loaded.");
    const button = screen.getByRole("button", { name: "Reload app" });
    await user.tab();
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    expect(reload).toHaveBeenCalledOnce();
    // A document reload remounts App. The restored endpoint now supplies the workspace.
    cleanup();
    render(<MemoryRouter><App /></MemoryRouter>);
    await screen.findByRole("button", { name: "Signed in as Aino" });
    expect(api.people).toHaveBeenCalledTimes(2);
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("People could not be loaded.")).toBeNull();
  });

  it("keeps a failed decision queue unknown through retry and shows all-clear only after success", async () => {
    const user = userEvent.setup();
    const retry = deferred<HomeResp>();
    vi.mocked(api.home).mockRejectedValueOnce(new Error("Decision queue unavailable.")).mockReturnValueOnce(retry.promise);
    render(show(<Home />));
    await screen.findByText("Decision queue unavailable.");
    expect(screen.queryByText("Nothing needs you.")).toBeNull();
    expect(screen.queryByText("No events.")).toBeNull();
    expect(screen.getByText(/Decisions are unavailable/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Try again" });
    button.focus();
    await user.keyboard("{Enter}");
    expect(api.home).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status").textContent).toContain("Loading decisions");
    expect(screen.queryByText("Nothing needs you.")).toBeNull();
    await act(async () => retry.resolve(emptyHome));
    await screen.findByText("Nothing needs you.");
    expect(screen.getByText("No events.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("withdraws a previous all-clear when refreshing the decision queue fails", async () => {
    vi.mocked(api.home).mockResolvedValueOnce(emptyHome).mockRejectedValueOnce(new Error("Refresh unavailable."));
    const view = render(show(<Home />));
    await screen.findByText("Nothing needs you.");
    view.rerender(show(<Home />, 1));
    await screen.findByText("Refresh unavailable.");
    expect(screen.queryByText("Nothing needs you.")).toBeNull();
    expect(screen.queryByText("No events.")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("initial list progress", () => {
  it("announces the pending Requests read, then replaces progress with the returned request", async () => {
    const read = deferred<HomeResp>();
    vi.mocked(api.home).mockReturnValue(read.promise);
    render(show(<Requests />));
    expect(screen.getByRole("status").textContent).toBe("Loading requests…");
    expect(screen.queryByText("No requests yet.")).toBeNull();
    await act(async () => read.resolve({ ...emptyHome, plans: [{ id: "milk", title: "Conference milk", summary: "Ready for review", status: "needs_input", createdAt: status.clock.now, createdBy: "Aino" }] }));
    expect((await screen.findByRole("link", { name: /Conference milk/ })).getAttribute("href")).toBe("/requests/milk");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("announces the pending Events read and removes progress when it fails", async () => {
    const read = deferred<Awaited<ReturnType<typeof api.events>>>();
    vi.mocked(api.events).mockReturnValue(read.promise);
    render(show(<Events />));
    expect(screen.getByRole("status").textContent).toBe("Loading events…");
    await act(async () => read.reject(new Error("Events unavailable.")));
    await screen.findByText("Events unavailable.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("removes Events progress after a successful empty read", async () => {
    const read = deferred<Awaited<ReturnType<typeof api.events>>>();
    vi.mocked(api.events).mockReturnValue(read.promise);
    render(show(<Events />));
    expect(screen.getByRole("status").textContent).toBe("Loading events…");
    await act(async () => read.resolve({ events: [] }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
