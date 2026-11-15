import { useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";

/** Focus and dismissal for a button that opens a menu of links and actions. */
export function useMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const entry = useRef<"first" | "last">("first");
  const id = useId();
  const close = () => setOpen(false);
  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const focusEntry = () => {
    const all = items();
    (entry.current === "first" ? all[0] : all.at(-1))?.focus();
  };

  useEffect(() => {
    if (!open) return;
    focusEntry();
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    entry.current = event.key === "ArrowUp" ? "last" : "first";
    if (open) focusEntry();
    else setOpen(true);
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" || event.key === "Tab") {
      // Let Tab take its normal step from the trigger, past the menu's -1 items.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      triggerRef.current?.focus();
      close();
      return;
    }
    const all = items();
    if (!all.length) return;
    const index = all.indexOf(document.activeElement as HTMLElement);
    let next: number;
    switch (event.key) {
      case "ArrowDown": next = (index + 1) % all.length; break;
      case "ArrowUp": next = (index - 1 + all.length) % all.length; break;
      case "Home": next = 0; break;
      case "End": next = all.length - 1; break;
      default: return;
    }
    event.preventDefault();
    all[next].focus();
  }

  return {
    open,
    close,
    rootProps: {
      ref: rootRef,
      onBlur: (event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close();
      },
    },
    triggerProps: {
      ref: triggerRef,
      id: `${id}-trigger`,
      "aria-haspopup": "menu" as const,
      "aria-expanded": open,
      "aria-controls": open ? `${id}-menu` : undefined,
      onKeyDown: onTriggerKeyDown,
      onClick: () => {
        entry.current = "first";
        setOpen((value) => !value);
      },
    },
    menuProps: {
      ref: menuRef,
      id: `${id}-menu`,
      role: "menu",
      "aria-labelledby": `${id}-trigger`,
      onKeyDown: onMenuKeyDown,
    },
  };
}
