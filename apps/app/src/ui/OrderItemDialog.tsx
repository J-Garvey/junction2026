import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icons";

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
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", escape);
    };
  }, [onClose]);

  return (
    <div className="item-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="item-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="item-dialog-head">
          <div>
            <div className="item-dialog-eyebrow">{eyebrow}</div>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button ref={closeRef} type="button" className="item-dialog-close" onClick={onClose} aria-label="Close details">
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
    </div>
  );
}
