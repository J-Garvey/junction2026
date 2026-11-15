import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { ModalParent, useModalFocus } from "./useModalFocus";

export interface DetailField {
  label: string;
  value: ReactNode;
}

export function OrderItemDialog({
  eyebrow,
  title,
  description,
  fields,
  children,
  onClose,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  fields?: DetailField[];
  children?: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const { scope, isTop } = useModalFocus(onClose);

  // Keep the fixed overlay outside page spacing and containing-block styles.
  return <ModalParent.Provider value={scope}>{createPortal(
    <div ref={scope.backdrop} className="item-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && isTop() && onClose()}>
      <section ref={scope.dialog} className="item-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="item-dialog-head">
          <div>
            <div className="item-dialog-eyebrow">{eyebrow}</div>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button ref={scope.close} type="button" className="item-dialog-close" onClick={onClose} aria-label="Close details">
            <Icon n="x" s={22} />
          </button>
        </header>
        <div className="item-dialog-body">
          {description && <div className="item-dialog-description">{description}</div>}
          {!!fields?.length && (
            <dl className="item-dialog-fields">
              {fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {children}
        </div>
      </section>
    </div>,
    document.body,
  )}</ModalParent.Provider>;
}
