import { createContext, createRef, useContext, useLayoutEffect, useRef, useState, type RefObject } from "react";

interface ModalScope {
  parent: ModalScope | null;
  backdrop: RefObject<HTMLDivElement | null>;
  dialog: RefObject<HTMLElement | null>;
  close: RefObject<HTMLButtonElement | null>;
  trigger: HTMLElement | null;
  previous: ModalScope | undefined;
}

export const ModalParent = createContext<ModalScope | null>(null);
const openModals: ModalScope[] = [];
const backgroundInert = new Map<HTMLElement, string | null>();
let previousOverflow = "";

function topModal() { return openModals.at(-1); }

function isolateBackground() {
  const activeBackdrop = topModal()?.backdrop.current;
  openModals.forEach((scope, index) => {
    const backdrop = scope.backdrop.current;
    const zIndex = String(100 + index);
    if (backdrop && backdrop.style.zIndex !== zIndex) backdrop.style.zIndex = zIndex;
  });
  const background = new Set(activeBackdrop
    ? Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== activeBackdrop)
    : []);
  for (const [node, previous] of backgroundInert) {
    if (background.has(node)) continue;
    if (previous === null) node.removeAttribute("inert");
    else node.setAttribute("inert", previous);
    backgroundInert.delete(node);
  }
  for (const node of background) {
    if (!backgroundInert.has(node)) backgroundInert.set(node, node.getAttribute("inert"));
    if (!node.hasAttribute("inert")) node.setAttribute("inert", "");
  }
}

function available(node: HTMLElement) {
  if (!node.isConnected || node.matches(":disabled")) return false;
  for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (ancestor.matches("[hidden], [inert]") || style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    // Only the summary of a closed disclosure participates in keyboard navigation.
    if (ancestor.parentElement instanceof HTMLDetailsElement && !ancestor.parentElement.open
      && ancestor !== ancestor.parentElement.querySelector("summary")) return false;
  }
  return true;
}

function tabStops(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'a[href], area[href], button, input, select, textarea, summary, iframe, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"]), [tabindex]',
  )).filter((node) => {
    const nativeStop = !node.hasAttribute("tabindex") && (node.isContentEditable
      || (node.tagName === "SUMMARY" && node.parentElement instanceof HTMLDetailsElement && node.parentElement.querySelector("summary") === node));
    return (node.tabIndex >= 0 || nativeStop) && available(node) && !(node instanceof HTMLInputElement && node.type === "hidden");
  })
    .filter((node, _, nodes) => {
      if (!(node instanceof HTMLInputElement) || node.type !== "radio" || !node.name) return true;
      const group = nodes.filter((other): other is HTMLInputElement => other instanceof HTMLInputElement && other.type === "radio" && other.name === node.name && other.form === node.form);
      return node === (group.find((radio) => radio.checked) ?? group[0]);
    })
    .sort((a, b) => (a.tabIndex > 0 ? a.tabIndex : Infinity) - (b.tabIndex > 0 ? b.tabIndex : Infinity));
}

/** One focus owner across body portals, including logically nested dialogs. */
export function useModalFocus(onClose: () => void) {
  const parent = useContext(ModalParent);
  const [scope] = useState<ModalScope>(() => ({
    parent, backdrop: createRef(), dialog: createRef(), close: createRef(),
    trigger: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    previous: topModal(),
  }));
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    const dialog = scope.dialog.current!;
    if (!openModals.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    // Child layout effects can register before their parent on the same commit.
    const childIndex = openModals.findIndex((other) => {
      for (let ancestor = other.parent; ancestor; ancestor = ancestor.parent) if (ancestor === scope) return true;
      return false;
    });
    openModals.splice(childIndex < 0 ? openModals.length : childIndex, 0, scope);
    isolateBackground();
    let lastFocused: HTMLElement | null = scope.close.current;
    const focusInside = () => {
      if (topModal() !== scope) return;
      const target = lastFocused && dialog.contains(lastFocused) && available(lastFocused) ? lastFocused : scope.close.current ?? dialog;
      target.focus({ preventScroll: true });
    };
    if (topModal() === scope) scope.close.current?.focus({ preventScroll: true });

    const focus = (event: FocusEvent) => {
      if (topModal() !== scope) return;
      if (event.target instanceof HTMLElement && dialog.contains(event.target)) lastFocused = event.target;
      else focusInside();
    };
    const keydown = (event: KeyboardEvent) => {
      if (topModal() !== scope || event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === "Tab") {
        const stops = tabStops(dialog);
        const index = stops.indexOf(document.activeElement as HTMLElement);
        const next = index < 0 ? (event.shiftKey ? stops.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length;
        event.preventDefault();
        (stops[next] ?? dialog).focus({ preventScroll: true });
      }
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", keydown);
    const observer = new MutationObserver(() => {
      isolateBackground();
      if (!dialog.contains(document.activeElement) || (document.activeElement instanceof HTMLElement && !available(document.activeElement))) focusInside();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden", "style", "tabindex"] });
    return () => {
      observer.disconnect();
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", keydown);
      const wasTop = topModal() === scope;
      openModals.splice(openModals.indexOf(scope), 1);
      isolateBackground();
      if (!openModals.length) document.body.style.overflow = previousOverflow;
      // Wait for React to remove portals and any trigger removed by the same update.
      queueMicrotask(() => {
        if (!wasTop || openModals.includes(scope)) return;
        const active = topModal();
        // A loading dialog can be replaced by the real review in one update.
        // Follow its return target if the focused loading control was removed.
        let origin: ModalScope | undefined = scope;
        while (origin && !origin.trigger?.isConnected) origin = origin.previous;
        const trigger = origin?.trigger;
        if (trigger && available(trigger) && (!active || active.dialog.current?.contains(trigger))) trigger.focus({ preventScroll: true });
        else if (active && !active.dialog.current?.contains(document.activeElement)) active.close.current?.focus({ preventScroll: true });
      });
    };
  }, [scope]);

  return { scope, isTop: () => topModal() === scope };
}
