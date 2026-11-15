// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pop } from "../src/ui/Popover";

afterEach(cleanup);

describe("product evidence popovers", () => {
  // Regression: keyboard users lost their place when closing product evidence.
  // Found by the gstack review on 2026-11-15.
  it("names the evidence dialog, moves focus inside and returns it on Escape", async () => {
    const user = userEvent.setup();
    const pageEscape = vi.fn();
    render(<div onKeyDown={(event) => { if (event.key === "Escape") pageEscape(); }}>
      <Pop label="Milk price"><p>Fixed supplier price: €12</p></Pop>
    </div>);
    const trigger = screen.getByRole("button", { name: "Milk price" });
    trigger.focus();
    await user.keyboard("{Enter}");

    const dialog = screen.getByRole("dialog", { name: "Milk price" });
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(pageEscape).not.toHaveBeenCalled();
  });

  it("returns focus to the source when the close control is used", async () => {
    const user = userEvent.setup();
    render(<Pop label="Stock evidence"><p>Stock remains unknown.</p></Pop>);
    const trigger = screen.getByRole("button", { name: "Stock evidence" });
    await user.click(trigger);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("dismisses when keyboard focus leaves without stealing focus from the next control", async () => {
    const user = userEvent.setup();
    render(<><Pop label="Pack evidence"><p>Ten litres per pack.</p></Pop><button type="button">Next product</button></>);
    await user.click(screen.getByRole("button", { name: "Pack evidence" }));
    const close = within(screen.getByRole("dialog")).getByRole("button", { name: "Close" });
    close.focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next product" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismisses an outside click without moving focus back to the source", async () => {
    const user = userEvent.setup();
    render(<><Pop label="Delivery evidence"><p>Delivery date is unknown.</p></Pop><button type="button">Another action</button></>);
    await user.click(screen.getByRole("button", { name: "Delivery evidence" }));
    const other = screen.getByRole("button", { name: "Another action" });
    other.focus();
    fireEvent.mouseDown(other);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(other);
  });
});
