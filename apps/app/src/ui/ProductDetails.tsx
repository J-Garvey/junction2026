import type { ReactNode } from "react";
import type { PlanLine, ProductDetails } from "@aimo/contracts";
import { api } from "../api";
import { useLoad } from "../ctx";
import { claimLabel, day, fi, qty, eur, when } from "../format";
import { stockText } from "./Popover";
import { Status } from "./Status";
import { CarbonEstimate } from "./CarbonEstimate";
import "./product-details.css";
import { LineCalculation } from "./CalculationEvidence";

const NOT_SUPPLIED = "Not supplied";
const number = (value: number) => value.toLocaleString("fi-FI", { maximumFractionDigits: 6 });
const amount = (value: number | null | undefined, unit: string) => value == null ? null : `${number(value)} ${unit}`;
const list = (values: string[] | undefined, label = (value: string) => value) => values?.length ? values.map(label).join(", ") : "None listed";

function Fact({ label, children }: { label: string; children?: ReactNode }) {
  return <><dt>{label}</dt><dd>{children == null || children === "" ? NOT_SUPPLIED : children}</dd></>;
}
function Group({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return <section className={`product-detail-group${wide ? " product-detail-wide" : ""}`}><h4>{title}</h4>{children}</section>;
}

/** Saved order terms and the full local catalogue; opening details never re-quotes. */
export function ProductDetailsPanel({ line }: { line: PlanLine }) {
  const { data: product, error, loading, reload } = useLoad(() => api.product(line.productId!), [line.productId]);
  const evidence = line.availabilityEvidence;
  return <div className="product-details">
    <p className="product-detail-id small muted">Product {line.productId}{line.source === "fixture" ? " · Fixture" : line.source === "live" ? " · Live lookup" : " · Supplier terms not checked"}</p>
    <div className="product-details-grid">
      <Group title="Order terms">
        <dl className="product-detail-fields small">
          <Fact label="Unit price ex VAT">{line.unitPrice == null ? "TBC" : `${eur(line.unitPrice)} / ${line.salesUnit ?? "sales unit"}`}</Fact>
          <Fact label="Line total ex VAT">{eur(line.lineTotal)}</Fact>
          <Fact label="Order quantity">{amount(line.quantity, line.salesUnit ?? "sales units")}</Fact>
          <Fact label="Required amount">{amount(line.needAmount.value, line.needAmount.unit)}</Fact>
          <Fact label="Order pack">{line.packContent ? `${number(line.packContent.value)} ${line.packContent.unit} per ${line.salesUnit ?? "sales unit"} (${line.packContent.verified ? "checked" : "unverified"}; ${line.packContent.source})` : "Unknown; do not infer pieces from weight."}</Fact>
          <Fact label="Pack rounding">{line.overshoot ? `${number(line.overshoot.amount)} ${line.needAmount.unit} extra (${number(line.overshoot.pct)}%; ${eur(line.overshoot.eur)})` : "No extra amount recorded"}</Fact>
          <Fact label="Stock">{stockText(line.stock, line.salesUnit)}</Fact>
          <Fact label="Available date">{line.availableDate ? day(line.availableDate) : null}</Fact>
          <Fact label="Order cutoff (Helsinki)">{line.closingTime ? when(line.closingTime) : null}</Fact>
          <Fact label="Status"><Status k={line.status} /></Fact>
          <Fact label="Allocation">{claimLabel(line.allocation)}</Fact>
          <Fact label="Selected by">{line.rankStep ? claimLabel(line.rankStep) : null}</Fact>
          <Fact label="Carbon estimate for this line"><CarbonEstimate line={line} /></Fact>
          {line.carbonBasis && !line.removed && <Fact label="Carbon mass evidence">{number(line.carbonBasis.kgPerSalesUnit)} kg per {line.salesUnit ?? "sales unit"} · {line.carbonBasis.massSource}</Fact>}
          <Fact label="Stock risk accepted">{line.riskAccepted ? `${line.riskAccepted.by}, ${when(line.riskAccepted.at)} Helsinki; stock remains unconfirmed.` : "No acceptance recorded"}</Fact>
          {line.shares.length > 1 && <Fact label="Shared pack">{line.shares.map((share) => <div key={share.needId}>{share.label}: {qty(share.amount)} {line.needAmount.unit}</div>)}</Fact>}
        </dl>
        {!!line.rules.length && <ul className="product-detail-notes small">{line.rules.map((rule, index) => <li key={`${rule.ruleId}-${index}`}>{rule.message}</li>)}</ul>}
      </Group>
      <Group title="Saved calculation"><LineCalculation line={line} /></Group>
      <Group title="Original supplier schedules">
        {!evidence ? <p className="small muted">Original supplier schedule not saved. Recheck the item terms before ordering.</p> : <>
          <p className="small">Sales block: {evidence.salesBlock ? "Yes" : "No"}</p>
          {!evidence.schedules.length && <p className="small">No supplier schedules returned. Availability is not confirmed.</p>}
          {evidence.schedules.map((schedule, index) => <div className="product-detail-schedule" key={index}>
            <h5>Schedule {index + 1}</h5>
            <dl className="product-detail-fields small">
              <Fact label="Available date">{schedule.availableDate ? day(schedule.availableDate) : null}</Fact>
              <Fact label="Cutoff (Helsinki)">{schedule.closingTime ? when(schedule.closingTime) : null}</Fact>
              <Fact label="Sales unit">{schedule.salesUnit}</Fact>
              <Fact label="Stock">{stockText(schedule.stock, schedule.salesUnit)}</Fact>
              <Fact label="Sales block">{schedule.salesBlock ? "Yes" : "No"}</Fact>
            </dl>
          </div>)}
          {evidence.schedules.length > 0 && !evidence.schedules.some((schedule) => schedule.availableDate === line.availableDate && schedule.closingTime === line.closingTime)
            && <p className="small muted">Quoted delivery and cutoff are demo estimates; the original supplier schedules are shown above. Delivery and stock need rechecking.</p>}
        </>}
        <p className="small muted">A delivery hour is not supplied. Supplier terms are rechecked when ordering.</p>
      </Group>
    </div>
    {loading && !product && <p className="small muted" role="status">Loading product information…</p>}
    {(error || (!product && !loading)) && <p className="small muted" role="status">Product information could not be loaded. <button type="button" className="linkbtn" onClick={reload}>Try again</button></p>}
    {product && <CatalogueFacts product={product} />}
  </div>;
}

/** Catalogue values are descriptive evidence, never a new approval or supplier quote. */
export function CatalogueFacts({ product: p }: { product: ProductDetails }) {
  const d = p.catalogueDetails;
  const nutrition = Object.entries(p.nutrition ?? {});
  const freeFrom = d?.freeFrom ?? [];
  const contains = p.contains.filter((code) => code !== "X99");
  return <div className="product-details-grid">
    <Group title="Catalogue identity">
      <dl className="product-detail-fields small">
        <Fact label="Catalogue name">{p.name}</Fact>
        <Fact label="Finnish name">{p.nameFi}</Fact>
        <Fact label="Product ID">{p.id}</Fact>
        <Fact label="GTIN">{d?.gtin}</Fact>
        <Fact label="Brand">{p.brand}</Fact>
        <Fact label="Supplier">{p.vendor}</Fact>
        <Fact label="Category code">{p.category}</Fact>
        <Fact label="Country of origin">{country(p.origin)}</Fact>
        <Fact label="Listed substitute IDs">{list(p.substitutes)}</Fact>
        <Fact label="Inferred hotel uses">{list(d?.hotelTags, (tag) => tag.replaceAll("_", " ").replaceAll(":", ": "))}</Fact>
      </dl>
      <p className="small muted">Local catalogue. Hotel uses are inferred from category codes and names.</p>
    </Group>
    <Group title="Diet and allergen declarations">
      {!p.hasAllergenData && <p className="small">No allergen declaration supplied. Dietary suitability is unknown.</p>}
      <dl className="product-detail-fields small">
        <Fact label="Diet claims">{list(p.claims, claimLabel)}</Fact>
        <Fact label="Contains">{contains.length ? list(contains, allergenLabel) : "No contains entries supplied"}</Fact>
        <Fact label="May contain">{p.mayContain.length ? list(p.mayContain, allergenLabel) : "No may-contain entries supplied"}</Fact>
        <Fact label="Declared free from">{list(freeFrom.filter((code) => code !== "X99"), allergenLabel)}</Fact>
        <Fact label="Undeclared statements">{list(d?.allergenUndeclared, allergenLabel)}</Fact>
        <Fact label="Labels and certifications">{list(p.labels, claimLabel)}</Fact>
      </dl>
      {(p.contains.includes("X99") || freeFrom.includes("X99")) && <p className="small muted">The source includes X99: “does not contain declaration obligatory allergens”. This is an absence marker, not an allergen.</p>}
      {!!d?.allergenUndeclared.length && <p className="small muted">“Undeclared” means not intentionally included and assessed not to require a cross-contact declaration. It is weaker than a free-from declaration.</p>}
      <p className="small muted">Missing entries do not establish suitability. A lactose-free claim does not remove the milk allergen.</p>
    </Group>
    <Group title="Packaging and storage">
      <dl className="product-detail-fields small">
        <Fact label="Catalogue sales unit">{p.catalogueSalesUnit}</Fact>
        <Fact label="Catalogue pack (unverified)">{p.packContent ? `${number(p.packContent.value)} ${p.packContent.unit} per catalogue sales unit` : null}</Fact>
        <Fact label="Base unit">{d?.baseUnit}</Fact>
        <Fact label="Base units per sales unit">{d?.salesUnitInBaseUnits == null ? null : number(d.salesUnitInBaseUnits)}</Fact>
        <Fact label="Pack hierarchy">{d && Object.keys(d.units).length ? Object.entries(d.units).map(([unit, size]) => <div key={unit}>{unit}: {number(size)} base units</div>) : null}</Fact>
        <Fact label="Net weight per base unit">{amount(d?.netWeightKg, "kg")}</Fact>
        <Fact label="Net volume per base unit">{amount(d?.netVolumeL, "l")}</Fact>
        <Fact label="Net content source">{d?.netContentSource ? ({ synkka: "Manufacturer data", name: "Inferred from the product name", "synkka+name": "Weight from manufacturer data; volume inferred from the name" }[d.netContentSource] ?? d.netContentSource) : null}</Fact>
        <Fact label="Catalogue order step">{d?.allowedLotSize == null ? null : `${number(d.allowedLotSize)} sales units (unverified)`}</Fact>
        <Fact label="Variable weight">{d?.variableWeight == null ? null : d.variableWeight ? "Yes" : "No"}</Fact>
        <Fact label="VAT category">{d?.vatCategory ? `${d.vatCategory} (catalogue code; not a tax rate)` : null}</Fact>
        <Fact label="Storage label">{p.temperatureLabel ? ({ warm: "Ambient", cool: "Chilled", freeze: "Frozen" }[p.temperatureLabel] ?? p.temperatureLabel) : null}</Fact>
        <Fact label="Temperature class code">{p.temperature == null ? null : `${p.temperature} (undocumented ERP code)`}</Fact>
        <Fact label="Packaging deposits">{d?.deposits.length ? d.deposits.map((deposit, index) => <div key={index}>Material code {deposit.material}: {number(deposit.quantity)} {deposit.unit}. Deposit amount not supplied.</div>) : "None listed"}</Fact>
      </dl>
      <p className="small muted">Order whole sales units using the order pack above. Catalogue conversions and steps may differ from supplier terms. Exact storage temperatures are not supplied.</p>
    </Group>
    <Group title="Nutrition">
      <p className="small muted">Per 100 g or 100 ml, as supplied. The catalogue does not specify which basis applies.</p>
      {nutrition.length ? <dl className="product-detail-fields small">{nutrition.map(([key, value]) => <Fact key={key} label={NUTRIENTS[key]?.label ?? claimLabel(key)}>{amount(value, NUTRIENTS[key]?.unit ?? "")}</Fact>)}</dl> : <p className="small">Nutrition information not supplied.</p>}
    </Group>
    <Group title="Ingredients" wide>
      {d?.ingredientsEn || d?.ingredientsFi ? <>
        {d.ingredientsEn && <div><h5>English</h5><p lang="en" className="small product-detail-ingredients">{d.ingredientsEn}</p></div>}
        {d.ingredientsFi && <div><h5>Finnish</h5><p lang="fi" className="small product-detail-ingredients">{d.ingredientsFi}</p></div>}
      </> : <p className="small product-detail-ingredients">{p.ingredients || "Ingredient statement not supplied."}</p>}
    </Group>
    <Group title="Environmental and delivery data" wide>
      <dl className="product-detail-fields small">
        <Fact label="Carbon footprint">{p.co2KgPerKg == null ? "Unknown" : `${number(p.co2KgPerKg)} kg CO₂e / kg (product-group average)`}</Fact>
        <Fact label="Delivery reliability">{p.reliability == null ? "Unknown" : `${fi(p.reliability * 100, 1)}% of historical ordered quantity delivered`}</Fact>
      </dl>
      <p className="small muted">Carbon is a product-group estimate, not a measurement of this product. Historical reliability does not confirm this order's stock or delivery.</p>
    </Group>
  </div>;
}

const NUTRIENTS: Record<string, { label: string; unit: string }> = {
  kj: { label: "Energy (kJ)", unit: "kJ" }, kcal: { label: "Energy (kcal)", unit: "kcal" },
  fat: { label: "Fat", unit: "g" }, sat: { label: "Saturated fat", unit: "g" },
  carb: { label: "Carbohydrate", unit: "g" }, sugar: { label: "Sugars", unit: "g" },
  fibre: { label: "Fibre", unit: "g" }, prot: { label: "Protein", unit: "g" },
  salt: { label: "Salt", unit: "g" }, lactose: { label: "Lactose", unit: "g" },
};
function country(code: string | null) {
  if (!code) return null;
  try { return `${new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase())} (${code.toUpperCase()})`; }
  catch { return code; }
}
export function allergenLabel(code: string) {
  const names: Record<string, string> = {
    AM: "milk", AE: "eggs", AF: "fish", AC: "crustaceans", UM: "molluscs", AP: "peanuts", AN: "tree nuts", AY: "soybeans", AS: "sesame", BC: "celery", BM: "mustard", NL: "lupin", AU: "sulphites", AW: "cereals containing gluten", ML: "lactose",
    UW: "wheat", GB: "barley", GO: "oats", NR: "rye", GS: "spelt", GK: "kamut (Khorasan wheat)",
    SA: "almond", SC: "cashew", SH: "hazelnut", SM: "macadamia", SP: "pecan", SR: "brazil nut", ST: "pistachio", SW: "walnut", PN: "pine nuts",
    UN: "shellfish", SO: "coconut", PO: "pork", BF: "beef", CM: "chicken", ABD: "tuna", ADQ: "pollock", NP: "pod fruits (legumes)", NC: "cocoa", NE: "peas", NK: "coriander", NM: "corn (maize)", NW: "carrot", BP: "linalool",
  };
  return names[code] ? `${names[code]} (${code})` : code;
}
