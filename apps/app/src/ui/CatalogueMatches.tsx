import { useEffect, useState } from "react";
import type { Product, SingleLine } from "@aimo/contracts";
import { api } from "../api";
import { useShowAll } from "./ShowAll";

/** Name-only searches browse the catalogue before an order amount is known. */
export function CatalogueMatches({ line, disabled, onSelect }: {
  line: SingleLine;
  disabled: boolean;
  onSelect: (product: Product) => void;
}) {
  const [result, setResult] = useState<{ key: string; products: Product[]; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify(line);
  useEffect(() => {
    let live = true;
    setResult(null);
    const timer = setTimeout(() => {
      api.matchProducts(JSON.parse(key)).then(
        ({ products }) => { if (live) setResult({ key, products }); },
        (error: Error) => { if (live) setResult({ key, products: [], error: error.message }); },
      );
    }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [key, retry]);
  const current = result?.key === key ? result : null;
  const list = useShowAll(current?.products ?? [], 5, "catalogue matches");
  return <section className="search-help" aria-label={`Catalogue matches for ${line.query}`}>
    <h4>Catalogue matches</h4>
    <p className="small muted">Choose a product, then enter how much you need. Price, stock, delivery and order requirements are checked after you enter a quantity.</p>
    {!current ? <p role="status">Searching catalogue…</p>
      : current.error ? <p role="alert">{current.error} <button type="button" className="linkbtn" onClick={() => setRetry((n) => n + 1)}>Try again</button></p>
      : !current.products.length ? <p role="status">No catalogue matches. Refine the product description and try again.</p>
      : <>
        <ul className="stack-s">
          {list.visible.map((product) => <li key={product.id}>
            <b>{product.name}</b> <span className="small muted">Product {product.id}</span>{" "}
            <button type="button" className="btn sm" disabled={disabled} onClick={() => onSelect(product)} aria-label={`Choose ${product.name}`}>Choose product</button>
          </li>)}
        </ul>
        {list.toggle}
      </>}
  </section>;
}
