// @vitest-environment happy-dom
import { StrictMode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderItemDialog } from "../src/ui/OrderItemDialog";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function Example({ disconnectTrigger = false }: { disconnectTrigger?: boolean }) {
  const [open, setOpen] = useState(false);
  const [child, setChild] = useState(false);
  const [editing, setEditing] = useState(false);
  return <>
    {(!open || !disconnectTrigger) && <button onClick={() => setOpen(true)}>Review milk</button>}
    <button>Search</button>
    {open && <OrderItemDialog eyebrow="Request" title="Review the item" onClose={() => setOpen(false)}>
      <button onClick={() => setEditing(!editing)}>Edit quantity</button>
      {editing && <input aria-label="Quantity" />}
      <button disabled>Unavailable</button>
      <button hidden>Hidden</button>
      <div style={{ display: "none" }}><button>Hidden by parent</button></div>
      <details><summary>More</summary><button>Hidden disclosure</button></details>
      <button onClick={() => setChild(true)}>Product details</button>
      {child && <OrderItemDialog eyebrow="Product" title="Nested details" onClose={() => setChild(false)}>
        <button>Last child control</button>
      </OrderItemDialog>}
    </OrderItemDialog>}
  </>;
}

async function openExample(disconnectTrigger = false) {
  const user = userEvent.setup();
  const rendered = render(<StrictMode><Example disconnectTrigger={disconnectTrigger} /></StrictMode>);
  const trigger = screen.getByRole("button", { name: "Review milk" });
  await user.click(trigger);
  return { ...rendered, user, trigger, dialog: screen.getByRole("dialog", { name: "Review the item" }) };
}

describe("shared item dialog keyboard and isolation", () => {
  it("starts on Close and wraps both directions past disabled, hidden and collapsed controls", async () => {
    const { user, dialog } = await openExample();
    const close = within(dialog).getByRole("button", { name: "Close details" });
    const last = within(dialog).getByRole("button", { name: "Product details" });
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Edit quantity" }));
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByText("More"));
    await user.tab();
    expect(document.activeElement).toBe(last);
  });

  it("uses newly added and removed controls without reopening and recovers from outside focus", async () => {
    const { user, dialog } = await openExample();
    const edit = within(dialog).getByRole("button", { name: "Edit quantity" });
    await user.click(edit);
    await user.tab();
    const quantity = within(dialog).getByRole("textbox", { name: "Quantity" });
    expect(document.activeElement).toBe(quantity);
    await user.click(edit);
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByText("More"));
    act(() => screen.getByText("Search").focus());
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Removing a focused dynamic field also recovers focus without another keypress.
    await user.click(edit);
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole("textbox", { name: "Quantity" }));
    fireEvent.click(edit);
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  });

  it("isolates existing and newly mounted background portals, preserves inert and restores overflow", async () => {
    const alreadyInert = document.createElement("div");
    alreadyInert.setAttribute("inert", "existing");
    document.body.append(alreadyInert);
    document.body.style.overflow = "scroll";
    const { user, container, trigger } = await openExample();
    const latePortal = document.createElement("div");
    latePortal.innerHTML = "<button>Background portal</button>";
    act(() => { document.body.append(latePortal); });
    await waitFor(() => expect(latePortal.hasAttribute("inert")).toBe(true));
    expect(container.hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("dialog").closest("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(container.hasAttribute("inert")).toBe(false);
    expect(latePortal.hasAttribute("inert")).toBe(false);
    expect(alreadyInert.getAttribute("inert")).toBe("existing");
    expect(document.body.style.overflow).toBe("scroll");
    latePortal.remove();
    alreadyInert.remove();
  });

  it("lets only the nested portal own Tab and Escape, then returns to its parent trigger", async () => {
    const { user, dialog, trigger } = await openExample();
    const childTrigger = within(dialog).getByRole("button", { name: "Product details" });
    await user.click(childTrigger);
    const child = screen.getByRole("dialog", { name: "Nested details" });
    expect(dialog.closest("[inert]")).not.toBeNull();
    expect(child.closest("[inert]")).toBeNull();
    expect(document.activeElement).toBe(within(child).getByRole("button", { name: "Close details" }));
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(within(child).getByRole("button", { name: "Last child control" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(childTrigger));
    expect(screen.queryByRole("dialog", { name: "Nested details" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Review the item" })).toBe(dialog);
    expect(dialog.closest("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(document.body.style.overflow).toBe("");
  });

  it.each(["close", "backdrop"])("preserves %s pointer dismissal and focus restoration", async (method) => {
    const { user, dialog, trigger } = await openExample();
    await user.click(within(dialog).getByText("Review the item"));
    expect(screen.getByRole("dialog")).toBe(dialog);
    if (method === "close") await user.click(within(dialog).getByRole("button", { name: "Close details" }));
    else fireEvent.mouseDown(dialog.parentElement!);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("handles a removed trigger without focusing a disconnected node", async () => {
    const { user, trigger, container } = await openExample(true);
    const focus = vi.spyOn(trigger, "focus");
    expect(trigger.isConnected).toBe(false);
    await user.keyboard("{Escape}");
    await act(async () => {});
    expect(focus).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("");
  });

  it("cleans up nested dialogs when their whole owner unmounts", async () => {
    const { user, dialog, unmount, container } = await openExample();
    await user.click(within(dialog).getByRole("button", { name: "Product details" }));
    unmount();
    await act(async () => {});
    expect(container.hasAttribute("inert")).toBe(false);
    expect(document.querySelector(".item-dialog-backdrop")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("retains the original trigger when loading details are replaced by item review", async () => {
    function LoadedReview({ onClose }: { onClose: () => void }) {
      return <OrderItemDialog eyebrow="Request" title="Review the item" onClose={onClose}><button>Approve milk</button></OrderItemDialog>;
    }
    function LoadingExample() {
      const [stage, setStage] = useState<"closed" | "loading" | "ready">("closed");
      return <>
        <button onClick={() => setStage("loading")}>40 l lactose-free milk</button>
        {stage === "loading" && <OrderItemDialog eyebrow="Request" title="Loading details" onClose={() => setStage("closed")}>
          <button onClick={() => setStage("ready")}>Finish loading</button>
        </OrderItemDialog>}
        {stage === "ready" && <LoadedReview onClose={() => setStage("closed")} />}
      </>;
    }
    const user = userEvent.setup();
    render(<StrictMode><LoadingExample /></StrictMode>);
    const trigger = screen.getByRole("button", { name: "40 l lactose-free milk" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Finish loading" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close details" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("keeps a child mounted in the same commit above its parent and uses the current close callback", async () => {
    const parentClose = vi.fn();
    const oldClose = vi.fn();
    const newClose = vi.fn();
    const show = (onClose: () => void) => <OrderItemDialog eyebrow="Parent" title="Parent" onClose={parentClose}>
      <OrderItemDialog eyebrow="Child" title="Child" onClose={onClose}><button>Child action</button></OrderItemDialog>
    </OrderItemDialog>;
    const { rerender } = render(show(oldClose));
    const parent = screen.getByRole("dialog", { name: "Parent" });
    const child = screen.getByRole("dialog", { name: "Child" });
    expect(parent.closest("[inert]")).not.toBeNull();
    expect(child.closest("[inert]")).toBeNull();
    expect(Number(child.parentElement!.style.zIndex)).toBeGreaterThan(Number(parent.parentElement!.style.zIndex));
    expect(document.activeElement).toBe(within(child).getByRole("button", { name: "Close details" }));
    rerender(show(newClose));
    await userEvent.setup().keyboard("{Escape}");
    expect(newClose).toHaveBeenCalledOnce();
    expect(oldClose).not.toHaveBeenCalled();
    expect(parentClose).not.toHaveBeenCalled();
  });
});
