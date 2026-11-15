/**
 * Category tags: what each of the catalogue's categories holds, in the words its own product
 * names use, in English and Finnish. Built from data/products_slim.jsonl at start-up, so a new
 * catalogue gets new tags without a hand-made list.
 *
 * A tag is a word that names many products in the category and is not spread thin across the
 * catalogue: "bean" is a tag of canned beans and of coffee beans; "frozen" is a tag of nothing.
 * Search uses the same word statistics to map Finnish words to English ones ("papu" → "bean"),
 * to find the Finnish stem of an English word ("lentil" → "linssi") and to suggest a spelling
 * ("chese" → "cheese"). `pnpm --filter @aimo/api tags` writes the tags to
 * data/category_tags.json for people to read.
 */
import type { Product } from "@aimo/contracts";

export type Tag = { word: string; n: number; share: number; focus: number };
export type CategoryTags = { category: string; size: number; label: string; en: Tag[]; fi: Tag[]; examples: string[] };

const lc = (s: string) => s.toLowerCase().normalize("NFC");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const singularEn = (w: string) =>
  w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 4 && /(oes|ches|shes|sses|xes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w) ? w.slice(0, -1) : w;

/** Words that describe any product (state, diet, pack, size), so they never name a category. */
const GENERIC = new Set(`and with in of for the a an on to or from by n x e ca appr approx about pcs pc kpl pkt pack packs box boxes bag bags
  can cans tin jar jars bottle bottles bucket tub tray trays pouch carton cartons sack sacks pail case portion portions piece pieces
  frozen fresh chilled organic natural plain classic original premium professional pro mini maxi big large small medium extra super
  free lactose gluten vegan vegetarian low fat light whole half sliced diced grated shredded cut cooked raw ready smoked dried
  salted unsalted sweetened unsweetened finnish finland suomi suomalainen new style type mix mixed assorted assortment various
  red green white black yellow brown blue pink gold golden dark uht esl gn approximately
  ja tai sekä ilman pakaste pakasteena tuore luomu kypsä raaka iso pieni rasia pussi purkki pullo laatikko säkki noin
  gluteeniton laktoositon vegaaninen maidoton kevyt rasvaton täysjyvä viipaloitu suolattu suolaton kuivattu savustettu`.split(/\s+/));

/** The plain words of a name: letters only, brand removed, anything after a comma or bracket left out. */
export function nameWords(name: string | null, brand: string | null): string[] {
  if (!name) return [];
  let s = lc(name).replace(/[®™©]/g, " ");
  const b = brand ? lc(brand).trim() : "";
  if (b.length >= 3) s = s.replace(new RegExp(`(^|[^\\p{L}])${esc(b)}(?=$|[^\\p{L}])`, "gu"), "$1 ");
  s = s.split(/[,;(]/)[0];
  return [...s.matchAll(/\p{L}{3,}/gu)].map((m) => m[0]).filter((w) => !GENERIC.has(w));
}

/** A Finnish word and the tails a compound ends in: "juustokakku" → juustokakku, ustokakku … kakku. */
export function fiTails(w: string): string[] {
  const out = [w];
  for (let i = 1; i + 4 <= w.length; i++) out.push(w.slice(i));
  return out;
}

/**
 * Finnish consonant gradation, strong → weak, so a stem also finds its other forms:
 * papu/pavut, kakku/kakut, tomaatti/tomaatit.
 */
const V = "[aeiouyäö]";
const GRADATION: [RegExp, string][] = [
  [new RegExp(`kk(${V})$`), "k$1"], [new RegExp(`pp(${V})$`), "p$1"], [new RegExp(`tt(${V})$`), "t$1"], [new RegExp(`nk(${V})$`), "ng$1"],
  [new RegExp(`mp(${V})$`), "mm$1"], [new RegExp(`lt(${V})$`), "ll$1"], [new RegExp(`nt(${V})$`), "nn$1"], [new RegExp(`rt(${V})$`), "rr$1"],
  [new RegExp(`(${V})p(${V})$`), "$1v$2"], [new RegExp(`(${V})t(${V})$`), "$1d$2"],
];
export function fiVariants(w: string): string[] {
  const out = new Set([w]);
  for (const [re, to] of GRADATION) if (re.test(w)) out.add(w.replace(re, to));
  return [...out].filter((v) => v.length >= 4);
}

type Words = { p: Product; en: string[]; fi: string[]; copy: boolean };
type Built = {
  cats: Map<string, CategoryTags>;
  /** English word (singular) → categories where it is a tag. */
  enIndex: Map<string, (Tag & { category: string })[]>;
  /** Whole catalogue words in either language, with product counts. */
  vocab: Map<string, number>;
  fiVocab: Set<string>;
  /** English word (singular) → products whose English name has it. */
  enCount: Map<string, number>;
  words: Words[];
};
let built: Built | null = null;
let builtFor: Product[] | null = null;

/** A tag names at least two products and a tenth of the range, and the category holds a tenth of the word's products. */
export const TAG_MIN = 2;
export const TAG_SHARE = 0.1;
export const TAG_FOCUS = 0.1;

export function buildCategoryTags(all: Product[]): Built {
  if (built && builtFor === all) return built;
  const size = new Map<string, number>();
  const df = { en: new Map<string, Map<string, number>>(), fi: new Map<string, Map<string, number>>() };
  const gdf = { en: new Map<string, number>(), fi: new Map<string, number>() };
  const examples = new Map<string, string[]>();
  const vocab = new Map<string, number>();
  const fiVocab = new Set<string>();
  const enCount = new Map<string, number>();
  const words: Words[] = [];
  for (const p of all) {
    const en = nameWords(p.name, p.brand);
    const fi = nameWords(p.nameFi, p.brand);
    words.push({ p, en, fi, copy: !p.nameFi || lc(p.nameFi) === lc(p.name) });
    size.set(p.category, (size.get(p.category) ?? 0) + 1);
    const ex = examples.get(p.category) ?? [];
    if (ex.length < 3) ex.push(p.name);
    examples.set(p.category, ex);
    for (const w of new Set([...en, ...fi])) vocab.set(w, (vocab.get(w) ?? 0) + 1);
    for (const w of fi) fiVocab.add(w);
    if (!(!p.nameFi || lc(p.nameFi) === lc(p.name))) for (const w of new Set(en.map(singularEn))) enCount.set(w, (enCount.get(w) ?? 0) + 1);
    for (const [lang, ws] of [["en", new Set(en.map(singularEn))], ["fi", new Set(fi.flatMap(fiTails))]] as const) {
      for (const w of ws) {
        const m = df[lang].get(p.category) ?? new Map<string, number>();
        m.set(w, (m.get(w) ?? 0) + 1);
        df[lang].set(p.category, m);
        gdf[lang].set(w, (gdf[lang].get(w) ?? 0) + 1);
      }
    }
  }
  const cats = new Map<string, CategoryTags>();
  const enIndex: Built["enIndex"] = new Map();
  for (const [cat, n] of [...size].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const pick = (lang: "en" | "fi") =>
      [...(df[lang].get(cat) ?? new Map<string, number>())]
        .map(([word, k]) => ({ word, n: k, share: +(k / n).toFixed(3), focus: +(k / gdf[lang].get(word)!).toFixed(3) }))
        .filter((t) => t.n >= TAG_MIN && t.share >= TAG_SHARE && t.focus >= TAG_FOCUS)
        .sort((a, b) => b.n - a.n || (a.word < b.word ? -1 : 1));
    const en = pick("en").slice(0, 12);
    // A Finnish tail counts only as a real word ("kakku", not "akakku"), and only if no longer
    // tail holds nearly all of it.
    const fiAll = pick("fi").filter((t) => fiVocab.has(t.word));
    const fi = fiAll.filter((t) => !fiAll.some((o) => o.word.length > t.word.length && o.word.endsWith(t.word) && o.n >= 0.8 * t.n)).slice(0, 12);
    cats.set(cat, { category: cat, size: n, label: (en.length ? en : fi).slice(0, 3).map((t) => t.word).join(", "), en, fi, examples: examples.get(cat) ?? [] });
    for (const t of en) enIndex.set(t.word, [...(enIndex.get(t.word) ?? []), { ...t, category: cat }]);
  }
  built = { cats, enIndex, vocab, fiVocab, enCount, words };
  builtFor = all;
  return built;
}

/** Products whose English name has the word (any number). */
export function enWordCount(word: string, all: Product[]): number {
  const w = singularEn(lc(word));
  return buildCategoryTags(all).enCount.get(w) ?? 0;
}

/** Categories where the English word (any number) is a tag. */
export function tagCategories(word: string, all: Product[]): (Tag & { category: string })[] {
  return buildCategoryTags(all).enIndex.get(singularEn(lc(word))) ?? [];
}

const fiToEnCache = new Map<string, string | null>();
/**
 * The English word the catalogue uses for a Finnish one: the English word most of the products
 * share whose Finnish name has that word ("papu" → "bean", "kakku" → "cake"). The word on its own
 * ("sipuli", "sipulit") outvotes compounds ("valkosipuli" is garlic). Null when the word isn't
 * Finnish product vocabulary or the products don't agree.
 */
export function fiToEn(word: string, all: Product[]): string | null {
  const w = lc(word);
  if (fiToEnCache.has(w)) return fiToEnCache.get(w)!;
  const vs = fiVariants(w);
  const { words } = buildCategoryTags(all);
  const own: Words[] = [];
  const compound: Words[] = [];
  for (const x of words) {
    if (x.copy) continue;
    // The word is the head: nothing, or a short ending, after it.
    const at = (f: string) => vs.map((v) => ({ at: f.lastIndexOf(v), v })).find((h) => h.at >= 0 && f.length - h.at - h.v.length <= 3);
    const hits = x.fi.map(at).filter(Boolean) as { at: number }[];
    if (!hits.length) continue;
    (hits.some((h) => h.at === 0) ? own : compound).push(x);
  }
  const vote = (ps: Words[]) => {
    const counts = new Map<string, number>();
    for (const x of ps) for (const e of new Set(x.en.map(singularEn))) counts.set(e, (counts.get(e) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    return top && top[1] >= Math.max(3, 0.4 * ps.length) ? top[0] : null;
  };
  const out = (own.length >= 3 ? vote(own) : null) ?? vote([...own, ...compound]);
  fiToEnCache.set(w, out);
  return out;
}

const enToFiCache = new Map<string, string[]>();
/**
 * Finnish stems for an English word: the Finnish word most of the products named with it share,
 * and that seldom appears without it ("bean" → "papu", "lentil" → "linssi"). A stem must be
 * a real Finnish word; its gradation forms are added ("papu" → "pavu").
 */
export function enToFi(word: string, all: Product[]): string[] {
  const w = singularEn(lc(word));
  const hit = enToFiCache.get(w);
  if (hit) return hit;
  const { words, fiVocab } = buildCategoryTags(all);
  const withWord = words.filter((x) => !x.copy && x.en.some((e) => singularEn(e) === w));
  const df = new Map<string, number>();
  for (const x of withWord) {
    const en = new Set(x.en);
    // Every real Finnish word inside the name's words: "jättipapuja" holds "papu" and "papuja".
    const stems = new Set<string>();
    for (const f of x.fi) {
      if (en.has(f)) continue;
      for (let i = 0; i < f.length; i++) for (let j = i + 4; j <= f.length; j++) if (fiVocab.has(f.slice(i, j))) stems.add(f.slice(i, j));
    }
    for (const t of stems) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const need = Math.max(3, 0.4 * withWord.length);
  // On a tie the longer word wins: "hillo", not "hill".
  const cands = [...df].filter(([, k]) => k >= need).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const out: string[] = [];
  for (const [s, k] of cands) {
    // A stem holding the English word is the loanword itself ("smokehouse" for "house").
    if (s.includes(w) || out.some((o) => s.includes(o) || o.includes(s))) continue;
    // Most Finnish names with the stem are this product in English too. Names given only in
    // Finnish can't say, so they don't count against it ("Hunajainen SAM Kesäkukka Hunaja").
    let total = 0;
    for (const x of words) if (!x.copy && x.fi.some((f) => f.includes(s))) total++;
    if (k / total < 0.5) continue;
    out.push(s);
    if (out.length >= 2) break;
  }
  const withForms = [...new Set(out.flatMap(fiVariants))];
  enToFiCache.set(w, withForms);
  return withForms;
}

/** Two words the catalogue also writes as one ("chick peas" / "chickpeas"): another product. */
export function isCompound(a: string, b: string, all: Product[]): boolean {
  const { vocab } = buildCategoryTags(all);
  return [a + b, a + singularEn(b), singularEn(a + b)].some((w) => (vocab.get(w) ?? 0) >= 3);
}

/** Catalogue words one edit away (two for long words), most common first: "chese" → "cheese". */
export function didYouMean(word: string, all: Product[], limit = 3): string[] {
  const w = lc(word);
  if (w.length < 4) return [];
  const { vocab } = buildCategoryTags(all);
  if ((vocab.get(w) ?? 0) >= 3) return [];
  const max = w.length >= 8 ? 2 : 1;
  const out: [string, number][] = [];
  for (const [v, n] of vocab) {
    if (n < 3 || v === w || Math.abs(v.length - w.length) > max) continue;
    if (editDistance(w, v, max) <= max) out.push([v, n]);
  }
  return out.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit).map(([v]) => v);
}

/** Damerau-Levenshtein (an adjacent swap counts one), stopping early past `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
