/** Read-only catalogue and supplier inspection, independent of the buying funnel. */
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import type { ProductInspection } from "@aimo/contracts";
import { api } from "../api";
import { useApp, useLoad } from "../ctx";
import { day, helsinkiDate, when } from "../format";
import { CatalogueFacts, Fact, Group, SupplierSchedules } from "../ui/ProductDetails";
import "./products.css";

export function Products() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const { data, loading, error, reload } = useLoad(() => api.products(query), [query]);
  return <div className="page stack-l">
    <div><h1>Products</h1><p>Inspect catalogue products, prices and supplier delivery evidence. Inspection does not add items to an order.</p></div>
    <form className="product-search" onSubmit={(event) => {
      event.preventDefault();
      setParams({ q: String(new FormData(event.currentTarget).get("q") ?? "").trim() });
    }}>
      <label>Product name or ID<input name="q" type="search" maxLength={200} defaultValue={query} placeholder="Salmon or 461955" /></label>
      <button className="btn primary" type="submit">Search catalogue</button>
    </form>
    <p className="small"><Link to="/products/461955?date=2026-11-16">Inspect salmon 461955 — saved fixture example</Link></p>
    {loading ? <p role="status">Searching catalogue…</p> : error ? <p role="alert">{error} <button className="linkbtn" onClick={reload}>Try again</button></p> : data && <section aria-label="Catalogue results">
      <p className="small muted" role="status">{data.source}{query ? ` · ${data.products.length} results (up to 50)` : " · Search by name or product ID"}</p>
      {!!query && !data.products.length && <p>No products found.</p>}
      <ul className="product-results">{data.products.map((product) => <li key={product.id}>
        <Link to={`/products/${encodeURIComponent(product.id)}`}><b>{product.name}</b><span className="small">Product {product.id} · Inspect supplier terms</span></Link>
      </li>)}</ul>
    </section>}
  </div>;
}

export function SupplierProduct() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [revision, setRevision] = useState(0);
  const { now, me } = useApp();
  const date = params.get("date") ?? helsinkiDate(now);
  const { data, error, loading, reload } = useLoad(() => api.products(""), [me.id]);
  const siteId = params.get("siteId") ?? data?.sites[0]?.id ?? "";
  return <div className="page stack-l">
    <Link to="/products">← Products</Link>
    <div><h1>Supplier inspection · {id}</h1><p>Read-only supplier evidence. Inspection does not add items or place an order.</p></div>
    {loading ? <p role="status">Loading delivery sites…</p> : error ? <p role="alert">{error} <button className="linkbtn" onClick={reload}>Try again</button></p> : <>
      <form key={`${date}:${siteId}`} className="product-search" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setParams({ date: String(form.get("date")), siteId: String(form.get("siteId")) });
        setRevision((value) => value + 1);
      }}>
        <label>Needed by<input name="date" type="date" required defaultValue={date} /></label>
        <label>Delivery site<select name="siteId" defaultValue={siteId} required>{data?.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        <button className="btn primary" type="submit">Check supplier terms</button>
      </form>
      {siteId ? <Inspection key={`${id}:${date}:${siteId}:${me.id}:${revision}`} id={id} date={date} siteId={siteId} /> : <p role="alert">No permitted delivery site is available.</p>}
    </>}
  </div>;
}

function Inspection({ id, date, siteId }: { id: string; date: string; siteId: string }) {
  const { data, loading, error, reload } = useLoad(() => api.inspectProduct(id, date, siteId), [id, date, siteId]);
  if (loading) return <p role="status">Checking supplier terms…</p>;
  if (error || !data) return <p role="alert">{error ?? "Supplier terms could not be loaded."} <button className="linkbtn" onClick={reload}>Try again</button></p>;
  return <SupplierEvidence inspection={data} />;
}

const DELIVERY_LABEL: Record<ProductInspection["delivery"]["state"], string> = {
  not_available: "Not available", sales_blocked: "Sales blocked", cutoff_passed: "Cutoff passed", stock_unconfirmed: "Stock not confirmed",
  scheduled: "Supplier schedule available", unknown: "Delivery eligibility unknown", after_requested_date: "Arrives after requested date", out_of_stock: "Out of stock",
};

export function SupplierEvidence({ inspection: data }: { inspection: ProductInspection }) {
  const { lookup, delivery, product } = data;
  const price = lookup.price;
  const money = (value: number) => new Intl.NumberFormat("fi-FI", { style: "currency", currency: price?.currency ?? "EUR" }).format(value);
  return <section className="stack-l" aria-label="Supplier evidence">
    <div><h2>{product.name}</h2><p className="small">Product {product.id} · {lookup.source === "fixture" ? `Saved fixture (${lookup.fixtureName ?? "unnamed"})` : "Live Junction mock"} · Recorded {when(lookup.fetchedAt)} Helsinki</p></div>
    {data.fallback && <p className="callout" role="status">{data.fallback}</p>}
    <div className="product-details"><div className="product-details-grid">
      <Group title="Price and delivery eligibility">
        <p><strong>{DELIVERY_LABEL[delivery.state]}</strong></p><p>{delivery.message}</p>
        <dl className="product-detail-fields small">
          <Fact label="Fixed price ex VAT">{price ? `${money(price.value)} / ${lookup.salesUnit ?? "sales unit (not returned)"}` : "No valid fixed price returned"}</Fact>
          <Fact label="Comparison price">{price?.comparisonPrice != null ? `${money(price.comparisonPrice)} / ${price.comparisonUnit ?? "unit not supplied"}` : null}</Fact>
          <Fact label="Price valid from">{price?.validFrom ? day(price.validFrom.slice(0, 10)) : null}</Fact>
          <Fact label="Price valid to">{price?.validTo ? day(price.validTo.slice(0, 10)) : null}</Fact>
          <Fact label="Delivery site">{data.site.name}</Fact>
          <Fact label="Needed by">{day(data.requestedDate)}</Fact>
          <Fact label="Evaluated at (Helsinki)">{when(data.evaluatedAt)}</Fact>
        </dl>
        {!!delivery.rules.length && <ul className="product-detail-notes small">{delivery.rules.map((rule, index) => <li key={`${rule.ruleId}:${index}`}><b>{rule.ruleId}</b> · {rule.message}</li>)}</ul>}
        <p className="small muted">The price is a lookup, not a reservation or quote. No quantity has been checked.</p>
      </Group>
      <SupplierSchedules evidence={lookup.availabilityEvidence} />
    </div></div>
    <details><summary>Catalogue details</summary><CatalogueFacts product={product} /></details>
  </section>;
}
