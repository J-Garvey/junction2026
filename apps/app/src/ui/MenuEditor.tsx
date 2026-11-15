/**
 * Menu → order (CH-01, Q01.1): a table editor for dishes, ingredients and the amount per
 * guest, with the head count and diet groups. The server scales it (NEED-TOTAL), combines
 * the same product across dishes and returns one request for the shared item review.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { DietGroup, Unit } from "@aimo/contracts";
import { api, ApiError, type BasketResp, type EventDish, type EventIngredient, type MenuScale, type PlanResp, type StoredEvent } from "../api";
import { qty, plural } from "../format";
import { Icon } from "./icons";
import { RequestReviewDialog } from "./RequestReviewDialog";

const UNITS: Unit[] = ["g", "kg", "ml", "dl", "l", "pcs"];

/** Diet group presets: the same claim and allergen codes a typed request uses. */
const DIETS: { key: string; label: string; claims: string[]; avoid: string[] }[] = [
  { key: "lactose", label: "Lactose-free", claims: ["FREE_FROM_LACTOSE"], avoid: [] },
  { key: "gluten", label: "Gluten-free", claims: ["FREE_FROM_GLUTEN"], avoid: [] },
  { key: "milk", label: "Milk-free", claims: ["FREE_FROM_MILK"], avoid: [] },
  { key: "vegan", label: "Vegan", claims: ["VEGAN"], avoid: [] },
  { key: "nuts", label: "No nuts", claims: [], avoid: ["AN", "AP"] },
  { key: "fish", label: "No fish", claims: [], avoid: ["AF"] },
  { key: "egg", label: "No egg", claims: [], avoid: ["AE"] },
];
const dietKey = (g: DietGroup) => DIETS.find((d) => sameSet(d.claims, g.constraints.claims ?? []) && sameSet(d.avoid, g.constraints.avoidAllergens ?? []))?.key ?? "custom";
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;
const blankIngredient = (): EventIngredient => ({ id: uid("ing"), text: "", perPortion: { amount: 0, unit: "g" } });
const blankDish = (n: number): EventDish => ({ id: uid("dish"), name: `Dish ${n}`, outletId: "banquet", excludesGroups: [], ingredients: [blankIngredient()] });

type Draft = { guests: number; dietsConfirmed: boolean; dietGroups: DietGroup[]; dishes: EventDish[] };
const draftOf = (e: StoredEvent): Draft => ({ guests: e.guests, dietsConfirmed: e.dietsConfirmed, dietGroups: e.dietGroups, dishes: e.dishes.length ? e.dishes : [blankDish(1)] });

/** amount × guests in the friendliest unit: 30 600 g reads as 30.6 kg. */
function scaled(amount: number, unit: Unit, guests: number) {
  const v = amount * guests;
  if (unit === "g") return v >= 1000 ? `${qty(v / 1000)} kg` : `${qty(v)} g`;
  if (unit === "ml") return v >= 1000 ? `${qty(v / 1000)} l` : `${qty(v)} ml`;
  if (unit === "dl") return v >= 10 ? `${qty(v / 10)} l` : `${qty(v)} dl`;
  return `${qty(v)} ${unit}`;
}

type MenuEditorProps = { event: StoredEvent; menuInOrder: boolean; onSaved: () => void; onAdded: (basket?: BasketResp) => void };

export function MenuEditor(props: MenuEditorProps) {
  // An event owns its entire editing session, even when two events share a version.
  return <EventMenuEditor key={props.event.id} {...props} />;
}

function EventMenuEditor({ event, menuInOrder, onSaved, onAdded }: MenuEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(event));
  const [version, setVersion] = useState(event.version);
  const [dirty, setDirty] = useState(false);
  const [scale, setScale] = useState<MenuScale | null>(null);
  const [busy, setBusy] = useState<"save" | "order" | null>(null);
  const [note, setNote] = useState<{ cls: string; text: string } | null>(null);
  const [review, setReview] = useState<PlanResp | null>(null);
  const mounted = useRef(false);
  const scaleRevision = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Someone else saved the menu: take the new one unless there are unsaved edits here.
  useEffect(() => {
    if (!dirty && event.version !== version) {
      setDraft(draftOf(event));
      setVersion(event.version);
    }
  }, [event.version]);
  useEffect(() => {
    let active = true;
    const revision = scaleRevision.current;
    api.menu(event.id).then((r) => {
      // A slow initial load must not replace the result of a later save/generate.
      if (active && revision === scaleRevision.current) setScale(r.scale);
    }).catch(() => {});
    return () => { active = false; };
  }, [event.id]);

  const dietTotal = draft.dietGroups.reduce((s, g) => s + g.count, 0);
  const regular = Math.max(0, draft.guests - dietTotal);
  const eating = (d: EventDish) => regular + draft.dietGroups.filter((g) => !d.excludesGroups.includes(g.id)).reduce((s, g) => s + g.count, 0);
  const lineCount = useMemo(() => draft.dishes.reduce((s, d) => s + d.ingredients.filter((i) => i.text.trim()).length, 0), [draft.dishes]);

  const edit = (fn: (d: Draft) => Draft) => {
    setDraft(fn);
    setDirty(true);
    setNote(null);
  };
  const editDish = (id: string, fn: (d: EventDish) => EventDish) => edit((x) => ({ ...x, dishes: x.dishes.map((d) => (d.id === id ? fn(d) : d)) }));
  const editIng = (dishId: string, ingId: string, fn: (i: EventIngredient) => EventIngredient) =>
    editDish(dishId, (d) => ({ ...d, ingredients: d.ingredients.map((i) => (i.id === ingId ? fn(i) : i)) }));

  function body() {
    // Rows with no ingredient name are left out; everything else goes to the server as typed.
    return { version, ...draft, dishes: draft.dishes.map((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.text.trim()) })).filter((d) => d.ingredients.length || d.name.trim()) };
  }

  async function save(): Promise<number | null> {
    scaleRevision.current++;
    setBusy("save");
    setNote(null);
    try {
      const r = await api.saveMenu(event.id, body());
      if (!mounted.current) return null;
      setVersion(r.event.version);
      setDraft(draftOf(r.event));
      setScale(r.scale);
      setDirty(false);
      onSaved();
      return r.event.version;
    } catch (e) {
      if (!mounted.current) return null;
      if (e instanceof ApiError && e.status === 409 && e.body?.error === "edit_conflict") {
        const cur = e.body.current as StoredEvent;
        setNote({ cls: "yellow", text: `${cur.changes.at(-1)?.by ?? "Someone"} changed the menu while you were editing. Your edits are kept here; save again to replace theirs.` });
        setVersion(cur.version);
      } else setNote({ cls: "red", text: (e as Error).message });
      return null;
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function generate() {
    const v = dirty ? await save() : version;
    if (v === null || !mounted.current) return;
    scaleRevision.current++;
    setBusy("order");
    setNote(null);
    try {
      const r = await api.menuOrder(event.id, v);
      if (!mounted.current) return;
      setScale(r.scale);
      setReview(r);
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.body?.scale) setScale(e.body.scale);
      setNote({ cls: "red", text: (e as Error).message });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  return (
    <section className="menu-editor stack">
      <div className="menu-head card pad">
        <label className="field">
          <span className="small muted">Head count</span>
          <input type="number" min={0} inputMode="numeric" value={draft.guests || ""} placeholder="0" aria-label="Guests" onChange={(e) => edit((x) => ({ ...x, guests: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
        </label>
        <div className="menu-diets">
          <span className="small muted">Diet groups {draft.dietGroups.length > 0 && <>· {regular} with no restrictions</>}</span>
          {draft.dietGroups.map((g) => (
            <div key={g.id} className="menu-diet">
              <select
                aria-label="Diet"
                value={dietKey(g)}
                onChange={(e) => {
                  const d = DIETS.find((x) => x.key === e.target.value);
                  if (d) edit((x) => ({ ...x, dietGroups: x.dietGroups.map((y) => (y.id === g.id ? { ...y, label: d.label, constraints: { ...y.constraints, claims: d.claims, avoidAllergens: d.avoid } } : y)) }));
                }}
              >
                {dietKey(g) === "custom" && <option value="custom">{g.label}</option>}
                {DIETS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <input type="number" min={0} className="sminput" aria-label={`${g.label} guests`} value={g.count || ""} placeholder="0" onChange={(e) => edit((x) => ({ ...x, dietGroups: x.dietGroups.map((y) => (y.id === g.id ? { ...y, count: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : y)) }))} />
              <button type="button" className="btn sm ghost" aria-label={`Remove ${g.label}`} onClick={() => edit((x) => ({ ...x, dietGroups: x.dietGroups.filter((y) => y.id !== g.id), dishes: x.dishes.map((d) => ({ ...d, excludesGroups: d.excludesGroups.filter((id) => id !== g.id) })) }))}>
                <Icon n="x" s={14} />
              </button>
            </div>
          ))}
          <button type="button" className="btn sm ghost menu-add" onClick={() => edit((x) => ({ ...x, dietGroups: [...x.dietGroups, { id: uid("diet"), label: DIETS[0].label, count: 0, constraints: { claims: DIETS[0].claims, avoidAllergens: [], labels: [] }, standing: false }] }))}>
            <Icon n="plus" s={14} /> Diet group
          </button>
        </div>
        <label className="row small menu-confirm">
          <input type="checkbox" checked={draft.dietsConfirmed} onChange={(e) => edit((x) => ({ ...x, dietsConfirmed: e.target.checked }))} />
          <span>Allergies and diets are complete{draft.dietGroups.length ? "" : " (none at this event)"}</span>
        </label>
        {dietTotal > draft.guests && <div className="callout red small">Diet groups add up to {dietTotal}, more than the {draft.guests} guests.</div>}
      </div>

      {draft.dishes.map((d) => (
        <div key={d.id} className="card menu-dish">
          <div className="menu-dish-head">
            <input className="menu-dish-name" value={d.name} aria-label="Dish name" placeholder="Dish name" onChange={(e) => editDish(d.id, (x) => ({ ...x, name: e.target.value }))} />
            <span className="small muted">{plural(eating(d), "guest")}</span>
            <button type="button" className="btn sm ghost" aria-label={`Remove ${d.name}`} onClick={() => edit((x) => ({ ...x, dishes: x.dishes.filter((y) => y.id !== d.id) }))}>
              <Icon n="x" s={14} />
            </button>
          </div>
          {draft.dietGroups.length > 0 && (
            <div className="menu-serves small">
              <span className="muted">Serves</span>
              {draft.dietGroups.map((g) => (
                <label key={g.id} className="row" style={{ gap: 4 }}>
                  <input type="checkbox" checked={!d.excludesGroups.includes(g.id)} onChange={(e) => editDish(d.id, (x) => ({ ...x, excludesGroups: e.target.checked ? x.excludesGroups.filter((id) => id !== g.id) : [...x.excludesGroups, g.id] }))} />
                  {g.label}
                </label>
              ))}
            </div>
          )}
          <div className="menu-rows">
            <div className="menu-row menu-row-head small muted">
              <span>Ingredient</span>
              <span>Amount</span>
              <span>Unit</span>
              <span>Basis</span>
              <span className="menu-total">Total</span>
              <span />
            </div>
            {d.ingredients.map((i) => {
              const fixed = !!i.total;
              const a = (fixed ? i.total : i.perPortion) ?? { amount: 0, unit: "g" as Unit };
              const setAmount = (amount: { amount: number; unit: Unit }, asTotal = fixed) =>
                editIng(d.id, i.id, (x) => {
                  const { perPortion: _p, total: _t, ...rest } = x;
                  return asTotal ? { ...rest, total: amount } : { ...rest, perPortion: amount };
                });
              return (
                <div key={i.id} className="menu-row">
                  <span className="menu-ing">
                    <input
                      value={i.text}
                      placeholder="e.g. whipping cream"
                      aria-label="Ingredient"
                      onChange={(e) =>
                        // New words, new product: a recipe-approved pick no longer applies.
                        editIng(d.id, i.id, ({ productId: _a, variants: _b, query: _c, productType: _d, category: _e, ...x }) => ({ ...x, text: e.target.value }))
                      }
                    />
                    {i.productId && <span className="menu-pin small muted" title="Recipe-approved product; changing the ingredient name removes it">#{i.productId}</span>}
                  </span>
                  <input type="number" min={0} step="any" inputMode="decimal" aria-label="Amount" value={a.amount || ""} placeholder="0" onChange={(e) => setAmount({ amount: Math.max(0, Number(e.target.value) || 0), unit: a.unit })} />
                  <select aria-label="Unit" value={a.unit} onChange={(e) => setAmount({ amount: a.amount, unit: e.target.value as Unit })}>
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <select aria-label="Basis" value={fixed ? "total" : "guest"} onChange={(e) => setAmount(a, e.target.value === "total")}>
                    <option value="guest">per guest</option>
                    <option value="total">in total</option>
                  </select>
                  <span className="menu-total small">{a.amount > 0 ? (fixed ? scaled(a.amount, a.unit, 1) : scaled(a.amount, a.unit, eating(d))) : "–"}</span>
                  <button type="button" className="btn sm ghost" aria-label="Remove ingredient" onClick={() => editDish(d.id, (x) => ({ ...x, ingredients: x.ingredients.filter((y) => y.id !== i.id) }))}>
                    <Icon n="x" s={14} />
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn sm ghost menu-add" onClick={() => editDish(d.id, (x) => ({ ...x, ingredients: [...x.ingredients, blankIngredient()] }))}>
            <Icon n="plus" s={14} /> Ingredient
          </button>
        </div>
      ))}
      <button type="button" className="btn sm ghost menu-add" onClick={() => edit((x) => ({ ...x, dishes: [...x.dishes, blankDish(x.dishes.length + 1)] }))}>
        <Icon n="plus" s={14} /> Dish
      </button>

      {scale && !dirty && <ScaledPreview scale={scale} />}
      {note && <div className={`callout ${note.cls} small`} role="status">{note.text}</div>}
      {menuInOrder && !note && <div className="callout yellow small" role="status">This order already has lines in it. Generating again adds the whole menu a second time.</div>}

      <div className="row menu-actions">
        <button type="button" className="btn" disabled={!!busy || !dirty} onClick={save}>
          {busy === "save" ? "Saving…" : dirty ? "Save menu" : "Saved"}
        </button>
        <button type="button" className="btn primary" disabled={!!busy || !draft.guests || !lineCount} onClick={generate}>
          <Icon n="list" s={16} />
          {busy === "order" ? "Checking products, stock and delivery…" : `Generate order for ${plural(draft.guests, "guest")}`}
        </button>
      </div>

      {review && (
        <RequestReviewDialog
          initialReview={review}
          deliveryDate={event.serviceDate}
          onClose={() => setReview(null)}
          onChanged={() => { if (mounted.current) onAdded(); }}
          onAdded={(basket) => {
            if (!mounted.current) return;
            setReview(null);
            setNote({ cls: "green", text: "Menu order added. Submit the final order for finance review." });
            onAdded(basket);
          }}
        />
      )}
    </section>
  );
}

/** What the head count turns the menu into, before any product is matched (NEED-TOTAL). */
function ScaledPreview({ scale }: { scale: MenuScale }) {
  if (!scale.lines.length && !scale.problems.length) return null;
  return (
    <div className="card menu-preview">
      <div className="li small muted">
        <span style={{ flex: 1 }}>
          Scaled for {plural(scale.guests, "guest")} · {plural(scale.lines.length, "order line")}
        </span>
      </div>
      {scale.lines.map((l) => (
        <div key={l.lineId} className="li">
          <span className="bqty">{qty(l.total.amount)} {l.total.unit}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ color: "var(--ink)" }}>{l.text}</span>
            {(l.constraints.claims.length > 0 || l.constraints.avoidAllergens.length > 0) && <span className="tag" style={{ marginLeft: 6 }}>{[...l.constraints.claims.map((c) => c.replace("FREE_FROM_", "no ").toLowerCase()), ...l.constraints.avoidAllergens.map((a) => `avoid ${a}`)].join(", ")}</span>}
            <span className="small muted menu-shares">{l.shares.map((s) => `${s.dishName}${s.groupId === "regular" ? "" : ` · ${s.groupLabel}`}: ${s.perPortion ? `${s.perPortion.amount} ${s.perPortion.unit} × ${s.guests}` : "event total"} = ${qty(s.amount)} ${l.total.unit}`).join(" · ")}</span>
          </span>
        </div>
      ))}
      {[...scale.problems, ...scale.warnings].map((r, k) => (
        <div key={k} className={`li small ${scale.problems.includes(r) ? "menu-problem" : "menu-warning"}`}>
          <Icon n="alert" s={14} /> {r.message}
        </div>
      ))}
    </div>
  );
}
