/**
 * Relevance for PRODUCT-SEARCH: what a product IS, not what its name mentions.
 * "cheese" should find cheeses, not cheesecake, cheese snacks or a cheese slicer.
 *
 * Each query term is read against the English and the Finnish name:
 * - head: the product is the thing ("Valio grated cheese", "sulatejuusto", "vuohenjuustoviipale")
 * - modifier: the term describes something else ("cheese cake", "juustokakku", "pizza with cheese")
 * - mention: can't tell
 * A category where the term is mostly the head is a home category of the term. Home
 * categories come from the catalogue itself, so every one of the 349 categories is
 * tagged for every term without a hand-made category list.
 *
 * Tiers, best first:
 *   0  head of the name, in a home category
 *   1  in a home category, but the name doesn't say so outright ("Port Salut 1kg slices");
 *      a modifier counts here only where the term is most of the category ("Valio cheese filling")
 *   2  head of the name, outside the home categories ("Atria Wilhelm Cheese" sausage)
 *   3  only mentions the term ("Cheese cake", "Taffel cheese snacks")
 * A search returns its best non-empty group: tiers 0–1, else 2, else 3.
 */
import type { Product } from "@aimo/contracts";

type Role = "head" | "modifier" | "mention";
type Tok = { w: string; seg: number; joined: boolean; num: boolean };
const lc = (s: string) => s.toLowerCase().normalize("NFC");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const singular = (w: string) =>
  w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 4 && /(oes|ches|shes)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
const plurals = (w: string) => [w, w + "s", w + "es", ...(w.endsWith("y") ? [w.slice(0, -1) + "ies"] : [])];

type Entry = { en: string[]; fi: string[]; isa?: string[]; notPrev?: string[]; notNext?: string[]; notPrefix?: string[]; flavour?: boolean };

/**
 * Terms a chef types, with the Finnish stems the catalogue uses. `isa` names the parent
 * (feta is a cheese), so "feta cheese" isn't read as feta describing a cheese.
 * `notPrev` / `notNext` / `notPrefix`: a word before or after, or a compound prefix, that makes
 * it another thing (ice cream and crème fraîche are not cream, valkosipuli is garlic, not onion).
 * `flavour`: often a flavour, so any product noun before it wins ("ice cream Strawberry").
 */
const LEXICON: Record<string, Entry> = {
  milk: { en: ["milk", "milk drink", "milkdrink"], fi: ["maito", "maitojuoma"], notPrev: ["coconut", "oat", "soy", "soya", "almond", "rice", "condensed", "condensated", "chocolate", "fermented", "curdled", "layered", "sour", "evaporated"], notPrefix: ["kookos", "kaura", "soija", "manteli", "riisi", "kondensoitu", "suklaa", "kaakao", "butter", "coconut"] },
  cream: { en: ["cream", "creme", "crème"], fi: ["kerma"], notPrev: ["ice", "sour", "coconut", "oat", "soy", "hand", "handwashing", "shaving", "cleaner", "balsamic", "balsamico", "skin"], notNext: ["fraiche", "fraîche", "cleaner"], notPrefix: ["hapan", "kookos", "kaura", "soija", "jää", "ranskan", "balsamico", "käsi"] },
  "whipping cream": { en: ["whipping cream", "whipped cream", "double cream"], fi: ["kuohukerma", "vispikerma", "vispautuva"], isa: ["cream"] },
  "cooking cream": { en: ["cooking cream"], fi: ["ruokakerma"], isa: ["cream"] },
  "coffee cream": { en: ["coffee cream"], fi: ["kahvikerma"], isa: ["cream"] },
  "sour cream": { en: ["sour cream", "creme fraiche", "crème fraîche"], fi: ["hapankerma", "smetana", "ranskankerma"] },
  butter: { en: ["butter"], fi: ["voi"], notPrev: ["peanut", "cocoa", "shea", "nut", "apple", "almond", "body"], notPrefix: ["maapähkinä", "kaakao", "pähkinä", "manteli"] },
  cheese: { en: ["cheese"], fi: ["juusto"] },
  "cream cheese": { en: ["cream cheese", "soft cheese"], fi: ["tuorejuusto"], isa: ["cheese"] },
  "cottage cheese": { en: ["cottage cheese"], fi: ["raejuusto"], isa: ["cheese"] },
  "blue cheese": { en: ["blue cheese", "blue mould cheese"], fi: ["sinihomejuusto", "aurajuusto"], isa: ["cheese"] },
  "goat cheese": { en: ["goat cheese", "goats cheese", "chevre", "chèvre"], fi: ["vuohenjuusto"], isa: ["cheese"] },
  "processed cheese": { en: ["processed cheese"], fi: ["sulatejuusto"], isa: ["cheese"] },
  feta: { en: ["feta"], fi: ["feta"], isa: ["cheese"] },
  halloumi: { en: ["halloumi"], fi: ["halloumi"], isa: ["cheese"] },
  mozzarella: { en: ["mozzarella"], fi: ["mozzarella"], isa: ["cheese"] },
  cheddar: { en: ["cheddar"], fi: ["cheddar"], isa: ["cheese"] },
  brie: { en: ["brie"], fi: ["brie"], isa: ["cheese"] },
  camembert: { en: ["camembert"], fi: ["camembert"], isa: ["cheese"] },
  gouda: { en: ["gouda"], fi: ["gouda"], isa: ["cheese"] },
  edam: { en: ["edam"], fi: ["edam"], isa: ["cheese"] },
  emmental: { en: ["emmental", "emmentaler", "emmenthal"], fi: ["emmental"], isa: ["cheese"] },
  parmesan: { en: ["parmesan", "parmigiano", "grana padano", "pecorino"], fi: ["parmesan", "parmigiano"], isa: ["cheese"] },
  mascarpone: { en: ["mascarpone"], fi: ["mascarpone"], isa: ["cheese"] },
  ricotta: { en: ["ricotta"], fi: ["ricotta"], isa: ["cheese"] },
  gorgonzola: { en: ["gorgonzola", "roquefort"], fi: ["gorgonzola", "roquefort"], isa: ["cheese"] },
  paneer: { en: ["paneer"], fi: ["paneer"], isa: ["cheese"] },
  "squeaky cheese": { en: ["squeaky cheese", "bread cheese"], fi: ["leipäjuusto"], isa: ["cheese"] },
  yoghurt: { en: ["yoghurt", "yogurt"], fi: ["jogurtti"] },
  quark: { en: ["quark"], fi: ["rahka"] },
  "oat milk": { en: ["oat milk", "oat drink", "oat beverage"], fi: ["kaurajuoma"] },
  "soy milk": { en: ["soy milk", "soya milk", "soy drink", "soya drink"], fi: ["soijajuoma"] },
  "almond milk": { en: ["almond milk", "almond drink"], fi: ["mantelijuoma"] },
  "coconut milk": { en: ["coconut milk"], fi: ["kookosmaito"] },
  "rice milk": { en: ["rice milk", "rice drink"], fi: ["riisijuoma"] },
  egg: { en: ["egg"], fi: ["kananmuna", "muna"], notPrev: ["easter", "chocolate"], notPrefix: ["pääsiäis", "suklaa"] },
  salmon: { en: ["salmon"], fi: ["lohi", "lohe"], notPrefix: ["kirjo"] },
  fish: { en: ["fish"], fi: ["kala"] },
  chicken: { en: ["chicken", "broiler"], fi: ["broileri", "kananpoika", "kananpojan", "kana"], notPrefix: ["pork"] },
  beef: { en: ["beef"], fi: ["nauta", "naudan", "häränliha"] },
  pork: { en: ["pork"], fi: ["porsas", "porsaan", "sianliha", "sika"] },
  ham: { en: ["ham"], fi: ["kinkku"] },
  bacon: { en: ["bacon"], fi: ["pekoni"] },
  turkey: { en: ["turkey"], fi: ["kalkkuna"] },
  duck: { en: ["duck"], fi: ["ankka", "ankan"] },
  lamb: { en: ["lamb"], fi: ["karitsa", "lammas", "lampaan"] },
  shrimp: { en: ["shrimp", "prawn"], fi: ["katkarapu", "jättikatkarapu", "jättirapu"] },
  tuna: { en: ["tuna"], fi: ["tonnikala"] },
  cod: { en: ["cod"], fi: ["turska"] },
  sausage: { en: ["sausage"], fi: ["makkara"] },
  potato: { en: ["potato"], fi: ["peruna"], notPrev: ["sweet", "croquette", "mashed", "french"], notPrefix: ["bataatti", "ranskan", "kroketti", "muusi"] },
  carrot: { en: ["carrot"], fi: ["porkkana"] },
  onion: { en: ["onion"], fi: ["sipuli"], notPrefix: ["valko", "ruoho"] },
  garlic: { en: ["garlic"], fi: ["valkosipuli"] },
  tomato: { en: ["tomato"], fi: ["tomaatti"] },
  mushroom: { en: ["mushroom", "champignon"], fi: ["herkkusieni", "sieni"] },
  apple: { en: ["apple"], fi: ["omena"], notPrefix: ["pine"], flavour: true },
  lemon: { en: ["lemon"], fi: ["sitruuna"], notNext: ["sole", "grass", "balm", "curd"], flavour: true },
  lime: { en: ["lime"], fi: ["lime"], flavour: true },
  orange: { en: ["orange"], fi: ["appelsiini"], flavour: true },
  banana: { en: ["banana"], fi: ["banaani"], flavour: true },
  strawberry: { en: ["strawberry", "strawberrys"], fi: ["mansikka", "mansikat"], flavour: true },
  raspberry: { en: ["raspberry"], fi: ["vadelma"], flavour: true },
  blueberry: { en: ["blueberry", "bilberry"], fi: ["mustikka", "mustikat"], flavour: true },
  lingonberry: { en: ["lingonberry", "cowberry"], fi: ["puolukka"], flavour: true },
  cranberry: { en: ["cranberry"], fi: ["karpalo"], flavour: true },
  cherry: { en: ["cherry"], fi: ["kirsikka"], flavour: true },
  mango: { en: ["mango"], fi: ["mango"], flavour: true },
  pineapple: { en: ["pineapple"], fi: ["ananas"], flavour: true },
  peach: { en: ["peach"], fi: ["persikka"], flavour: true },
  pear: { en: ["pear"], fi: ["päärynä"], flavour: true },
  vanilla: { en: ["vanilla"], fi: ["vanilja"], flavour: true },
  mint: { en: ["mint"], fi: ["minttu"], flavour: true },
  caramel: { en: ["caramel", "toffee"], fi: ["kinuski", "karamelli", "toffee"], flavour: true },
  cinnamon: { en: ["cinnamon"], fi: ["kaneli"], flavour: true },
  rice: { en: ["rice"], fi: ["riisi"] },
  flour: { en: ["flour"], fi: ["jauho"] },
  sugar: { en: ["sugar"], fi: ["sokeri"] },
  salt: { en: ["salt"], fi: ["suola"] },
  oil: { en: ["oil"], fi: ["öljy"] },
  coffee: { en: ["coffee"], fi: ["kahvi"] },
  tea: { en: ["tea"], fi: ["tee"], notPrev: ["ice", "iced"], notPrefix: ["jää"] },
  bread: { en: ["bread", "loaf"], fi: ["leipä"], notPrefix: ["pikku", "voi", "kolmio", "eväs", "ginger", "short", "sweet", "pipari"] },
  chocolate: { en: ["chocolate"], fi: ["suklaa"], notPrev: ["hot", "drinking"], notPrefix: ["kaakao", "kuuma"] },
  "ice cream": { en: ["ice cream"], fi: ["jäätelö"] },
  juice: { en: ["juice"], fi: ["täysmehu", "mehu"] },
  "orange juice": { en: ["orange juice"], fi: ["appelsiinitäysmehu", "appelsiinimehu"], isa: ["juice"] },
  cheesecake: { en: ["cheesecake", "cheese cake"], fi: ["juustokakku"] },
};

/** A noun after the term means the term only describes it: "cheese sauce", "milk chocolate". */
const EN_MOD = new Set(
  `cake cakes cheesecake cheesecakes pie pies tart tarts tartlet tartlets pastry pastries strudel roll rolls bun buns bread breads loaf
  bagel bagels croissant croissants donut donuts doughnut doughnuts muffin muffins twist twists whirl whirls pizza pizzas panini calzone
  focaccia sandwich sandwiches toast burger burgers sausage sausages patty patties nuggets balls ball bites pillows triangles rings sticks
  fingers chips crisps snack snacks popcorn crackers cracker biscuit biscuits cookie cookies wafer wafers sauce sauces salsa dip dips dipmix
  dressing mayonnaise mayo soup soups salad salads filling fillings lasagne lasagna gratin casserole quiche omelette croquettes croquette
  fries wedges mash flakes jalapenos jalapeños slicer shaker grater knife plane flavour flavor flavoured flavored taste drink drinks juice
  smoothie shake milkshake powder mix seasoning spice spices marinade paste puree purée ketchup mustard vinegar syrup jam marmalade jelly
  icing glaze topping toppings coating crumbs crust base stock bouillon broth gravy ice candy candies sweets chocolate chocolates truffle
  truffles cereal muesli granola porridge pudding mousse dessert cream milk cheese butter yoghurt yogurt quark oil noodles pasta ravioli
  tortellini cannelloni canneloni skewer skewers rice semolina pastille pastilles gum lollipop lollipops jellies drops soda dumplings wrap wraps tortilla tortillas nachos meatballs meatball pâté pate liqueur wine beer spread
  sticks substitute alternative coffee tea infusion cider sugar fries frites filter filters cup cups glass glas glasses mug mugs machine maker pot stirrer stirrers lid lids
  holder spoon tin mould napkin napkins candle candles tablecloth tableskirt bag bags scoop spreader filled coated covered dipped`.split(/\s+/),
);
for (const w of [...EN_MOD]) EN_MOD.add(singular(w));
EN_MOD.delete("spread"); // "cheese spread" is a cheese
/** Finnish tails that mark a different product, in a following word ("Cheese suolakeksi"). */
const FI_MOD_TAILS = `kakku kakut keksi keksit kastike kastikkeet leipä leivät sämpylä piirakka piiras pasteija keitto salaatti pizza sipsi
  sipsit lastut makkara makkarat pihvi pihvit dippi dippijauhe täyte täytteinen kierre rulla leivos leivokset muffinssi donitsi jäätelö
  suklaa juoma jauhe mauste maku makuinen makuiset höylä sirotin panini pallot tyyny kolmiot rengas vohveli pulla pullat majoneesi
  mehu snacks twist croissant calzone focaccia lautasliina liina servietti kynttilä pastilli purukumi tikkari jogurtti viili rahka smoothie suodatin suodatinpussi kuppi muki lasi kone keitin vuoka pussi`.split(/\s+/);
/** Forms of the same product: "juustoviipale" is cheese, "lohifilee" is salmon. */
const FI_FORMS = `viipaleet viipale viipaloitu kuutiot kuutio raaste raastettu palat pala murska nappi kiekko siivut siivu fileet filee file
  fileepala selkä kylki puolikas tanko kimpale kappale levy`.split(/\s+/);
/** Finnish endings that keep the word the head (plural, loanword "muffinssi"); genitive -n means it describes the next word. */
const FI_HEAD_ENDINGS = ["", "t", "et", "i", "it", "si", "ssi", "ssit"];
const FI_MENTION_ENDINGS = ["a", "ä", "ja", "jä", "ineen", "lla", "llä", "ssa", "ssä"];
/** A word before the term that makes it a filling or flavour: "mac and cheese", "soup with goat cheese". */
const PREV_MOD = new Set(["with", "and", "&", "n", "in", "filled", "stuffed", "flavoured", "flavored", "taste", "ja", "täytetty"]);
/** Query words that say the form, not the product: "salmon fillet" is about salmon. */
export const QUERY_FORMS = new Set(`fillet fillets slices slice sliced cubes cube diced grated shredded block blocks portion portions whole fresh frozen
  natural organic plain`.split(/\s+/));
const NUM = /^\d|^(g|kg|l|ml|dl|cl|x|pcs|kpl|pc|e|n|ca|appr|approx)$/;

/** Words of a name, with the brand removed so "Juustoportti butter" isn't cheese. */
export function tokenize(name: string, brand: string | null): Tok[] {
  let s = lc(name).replace(/[®™©]/g, " ");
  const b = brand ? lc(brand).trim() : "";
  if (b.length >= 3) s = s.replace(new RegExp(`(^|[^\\p{L}])${esc(b)}(?=$|[^\\p{L}])`, "gu"), "$1 ");
  const out: Tok[] = [];
  let seg = 0;
  const re = /\p{L}+|\d[\d.,]*\p{L}*|[,;(]|&/gu;
  for (const m of s.matchAll(re)) {
    const w = m[0];
    if (w === "," || w === ";" || w === "(") {
      seg++;
      continue;
    }
    const end = m.index! + w.length;
    const joined = (s[end] === "-" || s[end] === "/") && /\p{L}/u.test(s[end + 1] ?? "");
    out.push({ w, seg, joined, num: NUM.test(w) });
  }
  return out;
}

type Term = { key: string; en: string[][]; fi: string[]; family: Set<string>; famFi: string[]; notPrev: Set<string>; notNext: Set<string>; notPrefix: string[]; flavour: boolean };

const termCache = new Map<string, Term>();
function entryTerm(key: string, e: Entry): Term {
  const cached = termCache.get(key);
  if (cached) return cached;
  const en = e.en.map((v) => lc(v).split(/\s+/));
  // A phrase also matches written as one word: "cheesecake", "creamcheese".
  for (const v of e.en) if (v.includes(" ")) en.push([lc(v).replace(/\s+/g, "")]);
  // Specific aliases own the hit before a shorter stem can call them a modifier
  // ("milkdrink" / "maitojuoma" are milks, not an arbitrary drink mentioning milk).
  en.sort((a, b) => b.join(" ").length - a.join(" ").length);
  const fi = e.fi.map(lc).sort((a, b) => b.length - a.length);
  const family = new Set<string>();
  const famFi: string[] = [...fi];
  const addFam = (x: Entry) => {
    for (const v of x.en) for (const w of lc(v).split(/\s+/)) for (const p of plurals(w)) family.add(p);
    famFi.push(...x.fi.map(lc));
  };
  addFam(e);
  for (const p of e.isa ?? []) if (LEXICON[p]) addFam(LEXICON[p]);
  for (const c of Object.values(LEXICON)) if (c.isa?.includes(key)) addFam(c);
  const t: Term = { key, en, fi, family, famFi, notPrev: new Set(e.notPrev ?? []), notNext: new Set(e.notNext ?? []), notPrefix: e.notPrefix ?? [], flavour: Boolean(e.flavour) };
  termCache.set(key, t);
  return t;
}
function adhocTerm(w: string): Term {
  const key = `~${w}`;
  return termCache.get(key) ?? entryTerm(key, { en: [w], fi: w.length >= 5 ? [w] : [] });
}

const byVariant = new Map<string, string>();
for (const [k, e] of Object.entries(LEXICON)) {
  byVariant.set(k, k);
  for (const v of e.en) byVariant.set(lc(v), k);
  for (const v of e.fi) byVariant.set(lc(v), k);
}

/** The query as terms, longest lexicon phrase first: "cream cheese" is one term, not two. */
export function queryTerms(q: string): Term[] {
  const words = lc(q)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
  const out: Term[] = [];
  for (let i = 0; i < words.length; ) {
    let hit: { key: string; n: number } | null = null;
    for (let n = Math.min(4, words.length - i); n >= 1 && !hit; n--) {
      const phrase = words.slice(i, i + n);
      const exact = byVariant.get(phrase.join(" ")) ?? byVariant.get(phrase.map(singular).join(" "));
      if (exact) hit = { key: exact, n };
    }
    if (hit) {
      out.push(entryTerm(hit.key, LEXICON[hit.key]));
      i += hit.n;
    } else {
      out.push(adhocTerm(singular(words[i])));
      i++;
    }
  }
  return out;
}

/** Only vocabulary we understand as literal products/forms can skip language-model parsing. */
export function isLiteralProductQuery(q: string): boolean {
  if (!/^[\p{L}\s-]+$/u.test(q)) return false;
  const terms = queryTerms(q);
  return terms.length > 0 && terms.every((t) => !t.key.startsWith("~") || QUERY_FORMS.has(t.key.slice(1)) || EN_MOD.has(t.key.slice(1)));
}

function isModWord(w: string, t: Term, fi: boolean): boolean {
  if (t.family.has(w) || t.famFi.some((f) => w === f || w.startsWith(f))) return false;
  if (EN_MOD.has(w) || EN_MOD.has(singular(w))) return true;
  return fi && FI_MOD_TAILS.some((x) => (x.length >= 5 ? w.includes(x) : w.endsWith(x)));
}

/** What follows a whole-word hit: another noun (within three words, before the size) makes it a modifier. */
function roleAfter(toks: Tok[], i: number, t: Term, fi: boolean): Role {
  const tok = toks[i];
  if (toks[i + 1] && t.notNext.has(toks[i + 1].w)) return "modifier";
  if (tok.joined) {
    // "halloumi-juusto", "halloumi-kuutiot" are still halloumi; "juusto-kinkkupiirakka" is a pie.
    const next = toks[i + 1];
    const same = next && (t.family.has(next.w) || ["free", "style", "type", "based"].includes(next.w) || (fi && fiRemainder(next.w, t) !== "modifier"));
    if (next && !same) return "modifier";
  }
  for (let j = i + 1; j < toks.length && j <= i + 3; j++) {
    const n = toks[j];
    if (n.seg !== tok.seg || (n.num && !t.flavour)) break;
    if (isModWord(n.w, t, fi)) return "modifier";
  }
  return "head";
}

function roleBefore(toks: Tok[], i: number, t: Term, fi = false): Role | null {
  // A product noun, then the size, then the term: "yoghurt 4x125 g strawberry" is a flavour.
  let sized = t.flavour;
  for (let j = i - 1; j >= 0 && toks[j].seg === toks[i].seg; j--) {
    if (toks[j].num) sized = true;
    else if (sized && isModWord(toks[j].w, t, fi)) return "modifier";
  }
  const p1 = toks[i - 1];
  if (p1 && p1.seg === toks[i].seg && t.notPrev.has(p1.w)) return "modifier";
  for (const p of [toks[i - 1], toks[i - 2]]) if (p && p.seg === toks[i].seg && PREV_MOD.has(p.w)) return "modifier";
  return null;
}

/** Finnish compound: the stem's remainder must be empty, a plural, a form, or the parent ("briejuusto"). */
function fiRemainder(rem: string, t: Term): Role {
  for (let guard = 0; guard < 4; guard++) {
    if (FI_HEAD_ENDINGS.includes(rem)) return "head";
    if (FI_MENTION_ENDINGS.includes(rem)) return "mention";
    if (rem === "n") return "modifier";
    const f = FI_FORMS.find((x) => rem.startsWith(x)) ?? t.famFi.find((x) => x.length >= 4 && rem.startsWith(x));
    if (!f) return "modifier";
    rem = rem.slice(f.length);
  }
  return "modifier";
}

function occurrences(toks: Tok[], t: Term, fi: boolean): Role[] {
  const roles: Role[] = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i].w;
    if (toks[i].num) continue;
    let role: Role | null = null;
    // English: whole words, phrases and English compounds.
    for (const seq of t.en) {
      if (seq.length > 1) {
        if (seq.every((s, k) => toks[i + k] && (k === seq.length - 1 ? plurals(s).includes(toks[i + k].w) : toks[i + k].w === s))) {
          role = roleBefore(toks, i, t, fi) ?? roleAfter(toks, i + seq.length - 1, t, fi);
          break;
        }
        continue;
      }
      const v = seq[0];
      if (plurals(v).includes(w)) {
        role = roleBefore(toks, i, t, fi) ?? roleAfter(toks, i, t, fi);
        break;
      }
      // English compounds only in the English name; Finnish compounds are read below.
      if (!fi && v.length >= 4 && w.length > v.length) {
        if (w.startsWith(v)) {
          const rem = w.slice(v.length);
          role = rem === "s" || rem === "es" ? (roleBefore(toks, i, t, fi) ?? roleAfter(toks, i, t, fi)) : "modifier";
          break;
        }
        if (w.endsWith(v) || w.endsWith(v + "s")) {
          const prefix = w.slice(0, w.lastIndexOf(v));
          role = t.notPrefix.some((x) => prefix.endsWith(x)) ? "modifier" : (roleBefore(toks, i, t, fi) ?? roleAfter(toks, i, t, fi));
          break;
        }
        if (w.includes(v)) {
          role = "modifier";
          break;
        }
      }
    }
    // Finnish: stems inside compounds; the head of a Finnish compound is its last part.
    if (!role && fi) {
      for (const v of t.fi) {
        const at = w.lastIndexOf(v);
        if (at < 0 || (v.length < 4 && at > 0 && at + v.length < w.length)) continue;
        const prefix = w.slice(0, at);
        if (t.notPrefix.some((p) => prefix.endsWith(p))) {
          role = "modifier";
          break;
        }
        // A longer stem in the list owns the hit ("kananmuna" is egg, not chicken).
        if (prefix && t.fi.some((o) => o !== v && o.length > v.length && w.includes(o))) continue;
        const r = fiRemainder(w.slice(at + v.length), t);
        role = r === "head" ? (roleBefore(toks, i, t, true) ?? roleAfter(toks, i, t, true)) : r;
        break;
      }
    }
    if (!role) continue;
    if (role === "head" && toks[i].seg > 0) role = "mention";
    roles.push(role);
  }
  return roles;
}

const best = (rs: Role[]): Role | null => (rs.includes("head") ? "head" : rs.includes("mention") ? "mention" : rs.length ? "modifier" : null);

/** How the term relates to the product, from both names. */
const tokCache = new Map<string, { en: Tok[]; fi: Tok[] | null }>();
export function termRole(p: Product, t: Term): Role | null {
  let tk = tokCache.get(p.id);
  if (!tk) {
    tk = { en: tokenize(p.name, p.brand), fi: p.nameFi ? tokenize(p.nameFi, p.brand) : null };
    tokCache.set(p.id, tk);
  }
  const en = best(occurrences(tk.en, t, false));
  const fi = tk.fi ? best(occurrences(tk.fi, t, true)) : null;
  if (en === null && fi === null) return null;
  if (en === "head" && fi !== "modifier") return "head";
  if (fi === "head" && en !== "modifier") return "head";
  if (en === "head" || fi === "head") return "mention";
  if (en === "modifier" || fi === "modifier") return "modifier";
  return "mention";
}

export type HomeStats = { heads: number; size: number; share: number };
/** Equipment and pet food (20xxx), cleaning, paper and packaging (63–67xxx), office (9xxxx). */
export const isNonFood = (cat: string) => /^(20|6[3-9]|9)/.test(cat);
/** A food word (lemon, cream, coffee) finds food: "Lemon dishwasher tablets", "cream napkin" and "coffee cup" never come first. */
const foodTerm = new Map<string, boolean>();
const homeCache = new Map<string, Map<string, HomeStats>>();
const statsCache = new Map<string, Map<string, HomeStats>>();

/** Categories where the term is the product for at least a fifth of the range, or the most of any (at least two products). */
export function homeCategories(t: Term, all: Iterable<Product>): Map<string, HomeStats> {
  const cached = homeCache.get(t.key);
  if (cached) return cached;
  const heads = new Map<string, number>();
  const size = new Map<string, number>();
  for (const p of all) {
    size.set(p.category, (size.get(p.category) ?? 0) + 1);
    if (termRole(p, t) === "head") heads.set(p.category, (heads.get(p.category) ?? 0) + 1);
  }
  const out = new Map<string, HomeStats>();
  const stats = new Map<string, HomeStats>();
  let food = 0;
  for (const [cat, h] of heads) food += isNonFood(cat) ? -h : h;
  foodTerm.set(t.key, food >= 0);
  if (food >= 0) for (const cat of [...heads.keys()]) if (isNonFood(cat)) heads.delete(cat);
  const most = Math.max(0, ...heads.values());
  for (const [cat, h] of heads) {
    const n = size.get(cat)!;
    stats.set(cat, { heads: h, size: n, share: h / n });
    // The category with the most heads counts even when the term is a narrow kind in a wide
    // range (feta among the salad cheeses, 8 of 47).
    if (h >= 2 && (h / n >= HOME_SHARE || (h === most && h / n >= MOST_SHARE))) out.set(cat, { heads: h, size: n, share: h / n });
  }
  homeCache.set(t.key, out);
  statsCache.set(t.key, stats);
  return out;
}
export const HOME_SHARE = 0.2;
/** The top category still needs this share: three lemon teas among 106 teas don't make tea a lemon range. */
export const MOST_SHARE = 0.05;
/** Above this share the whole category counts (tier 1), even products the name doesn't say. */
export const HOME_STRONG = 0.6;
/** A neighbouring category joins when the term is the product for a twentieth of it. */
export const SIBLING_SHARE = 0.05;

export type Match = { product: Product; tier: 0 | 1 | 2 | 3; role: Role | null; term: string };

/** The names or brand have the term: English as whole words (with plurals), Finnish stems inside compounds. */
const wordsCache = new Map<string, { en: string[]; fi: string[] }>();
function mentions(p: Product, t: Term): boolean {
  if (t.key === "~vegan" && p.claims.includes("VEGAN")) return true;
  if ((t.key === "~vegetarian" || t.key === "~veggie") && p.claims.some((c) => c === "VEGAN" || c === "VEGETARIAN")) return true;
  let h = wordsCache.get(p.id);
  if (!h) {
    const words = (s: string) => lc(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    h = { en: words(`${p.name} ${p.brand ?? ""}`), fi: words(`${p.nameFi ?? ""} ${p.brand ?? ""}`) };
    wordsCache.set(p.id, h);
  }
  const english = (words: string[]) => t.en.some((seq) => words.some((w, i) => {
    if (seq.length > 1) return seq.every((v, j) => j === seq.length - 1 ? plurals(v).includes(words[i + j]) : words[i + j] === v);
    const v = seq[0];
    if (plurals(v).includes(w)) return true;
    if (v.length < 4) return false;
    if (w.startsWith(v)) return true;
    const at = w.lastIndexOf(v);
    return at > 0 && plurals(v).includes(w.slice(at)) && !t.notPrefix.some((x) => w.slice(0, at).endsWith(x));
  }));
  return english(h.en) || english(h.fi) || t.fi.some((v) => h!.fi.some((w) => {
    const at = w.lastIndexOf(v);
    return at >= 0 && !t.notPrefix.some((x) => w.slice(0, at).endsWith(x));
  }));
}

// These checks reject a conflicting identity; they never establish dietary/allergen safety.
const MEAT_TERMS = new Set("chicken beef pork ham bacon turkey duck lamb fish salmon tuna cod shrimp sausage".split(" "));
const DAIRY_TERMS = new Set(["milk", "cream", "butter", "cheese", "yoghurt", "quark", "ice cream"]);
const PLANT_WORDS = /\b(?:vegan|vegetarian|veggie|plant[ -]?based|meat[ -]?free)\b|\b(?:kasvis|kasvipohjai|vegaani)/i;
const VEGAN_WORDS = /\b(?:vegan|plant[ -]?based|non[ -]?dairy|dairy[ -]?free)\b|\b(?:kasvipohjai|vegaani)/i;
const QUERY_FILLER = new Set("some nice please a an the of i we need want buy order me us find for".split(" "));
const negationCache = new Map<string, RegExp[]>();

function deniesTerm(text: string, t: Term): boolean {
  let patterns = negationCache.get(t.key);
  if (!patterns) patterns = t.en.map((seq) => {
    const noun = seq.map(esc).join("[ -]*");
    return new RegExp(`\\b(?:no|non|not|without)[ -]*${noun}s?\\b|\\b${noun}[ -]*(?:free|less|alternative|substitute)\\b`, "i");
  });
  negationCache.set(t.key, patterns);
  return patterns.some((re) => re.test(text));
}

function conflictsWithRequest(p: Product, terms: Term[], q: string, claims: string[]): boolean {
  const name = `${p.name} ${p.nameFi ?? ""}`;
  const plantRequested = claims.includes("VEGAN") || claims.includes("VEGETARIAN") || PLANT_WORDS.test(q);
  return terms.some((t) => {
    if (deniesTerm(q, t)) return false;
    const meat = MEAT_TERMS.has(t.key);
    const dairy = DAIRY_TERMS.has(t.key) || LEXICON[t.key]?.isa?.some((k) => DAIRY_TERMS.has(k));
    // "Vegan chicken burger" explicitly asks for an analogue. "Chicken burger" does not.
    if (plantRequested && (meat || dairy || t.key === "egg")) return false;
    if (deniesTerm(name, t)) return true;
    if (meat && (p.claims.some((c) => c === "VEGAN" || c === "VEGETARIAN") || PLANT_WORDS.test(name))) return true;
    return Boolean((dairy || t.key === "egg") && (p.claims.includes("VEGAN") || VEGAN_WORDS.test(name)));
  });
}

/**
 * Scores `candidates` (already filtered by category, claims and allergens) against the query.
 * Every word besides the head term must appear in the name. `homeOverride`: the caller named the category, so it
 * is the home.
 */
export function rank(q: string, candidates: Product[], all: Iterable<Product>, homeOverride?: string, claims: string[] = []): Match[] {
  const terms = queryTerms(q);
  if (!terms.length) return candidates.map((product) => ({ product, tier: 0, role: null, term: "" }));
  const hi = headIndex(terms);
  const head = terms[hi];
  const all_ = [...all];
  // Only known conversational filler may be dropped. An unknown brand, species or form
  // must leave the request unmatched rather than silently broadening it.
  const quals = terms.filter((t, i) => i !== hi && !QUERY_FILLER.has(t.key.replace(/^~/, "")));
  const home = homeOverride ? null : homeCategories(head, all_);
  // Category codes group like products (1060x cheeses, 1870x fish), so a neighbour of a home
  // category holds the same kind: "SALMON FILLET C-CUT" sits with the trout fillets.
  // Only where the term is still a twentieth of that range: ready meals (17300) sit beside fresh pasta.
  const prefixes = new Set([...(home?.keys() ?? [])].map((c) => c.slice(0, 4)));
  const stats = statsCache.get(head.key);
  const sibling = (cat: string) => prefixes.has(cat.slice(0, 4)) && (stats?.get(cat)?.share ?? 0) >= SIBLING_SHARE;
  // A brand on its own ("valio") lists the brand's range; the names were read without it.
  const brand = head.key.startsWith("~") && !quals.length ? head.key.slice(1) : null;
  if (brand && candidates.some((p) => p.brand && lc(p.brand) === brand))
    return candidates.filter((p) => p.brand && lc(p.brand) === brand).map((product) => ({ product, tier: 0, role: "head", term: brand }));
  const out: Match[] = [];
  for (const p of candidates) {
    if (!quals.every((t) => mentions(p, t))) continue;
    const role = mentions(p, head) ? (termRole(p, head) ?? "mention") : null;
    const h = homeOverride ? { share: 1 } : home!.get(p.category);
    let tier: Match["tier"] | null = null;
    if ((h || (role === "head" && sibling(p.category))) && role === "head") tier = 0;
    else if (h && (role === "mention" || (!homeOverride && h.share >= HOME_STRONG))) tier = 1;
    else if (role === "head") tier = 2;
    else if (role !== null) tier = 3;
    if (tier !== null && tier < 3 && foodTerm.get(head.key) && isNonFood(p.category)) tier = 3;
    // Identity checks matter only for a text/category match, not every catalogue row.
    if (tier !== null && !conflictsWithRequest(p, terms, q, claims)) out.push({ product: p, tier, role, term: head.key.replace(/^~/, "") });
  }
  return out;
}

/** The head term: the last word that isn't a form ("salmon fillet" is about salmon). */
export function headIndex(terms: Term[]): number {
  let hi = terms.length - 1;
  while (hi > 0 && QUERY_FORMS.has(terms[hi].key.replace(/^~/, ""))) hi--;
  return hi;
}

/** PRODUCT-SEARCH relevance: the best group of `rank`, spread across categories. */
export function relevance(q: string, candidates: Product[], all: Product[], homeOverride?: string, claims: string[] = []): Match[] {
  const terms = queryTerms(q);
  const ms = rank(q, candidates, all, homeOverride, claims);
  return terms.length ? bestGroup(ms, homeCategories(terms[headIndex(terms)], all)) : ms;
}

/** Best group only, spread across categories so a vague "cheese" compares hard, sliced and soft cheese. */
function bestGroup(ms: Match[], home: Map<string, HomeStats>): Match[] {
  const top = ms.some((m) => m.tier <= 1) ? ms.filter((m) => m.tier <= 1) : ms.some((m) => m.tier === 2) ? ms.filter((m) => m.tier === 2) : ms;
  const out: Match[] = [];
  for (const tier of [0, 1, 2, 3]) {
    const byCat = new Map<string, Match[]>();
    for (const m of top.filter((x) => x.tier === tier).sort((a, b) => (a.product.id < b.product.id ? -1 : 1))) {
      const list = byCat.get(m.product.category) ?? [];
      list.push(m);
      byCat.set(m.product.category, list);
    }
    // Categories with the most head matches first, then round-robin, so one range can't fill the list.
    const cats = [...byCat.keys()].sort((a, b) => (home.get(b)?.heads ?? 0) - (home.get(a)?.heads ?? 0) || byCat.get(b)!.length - byCat.get(a)!.length || (a < b ? -1 : 1));
    const n = [...byCat.values()].reduce((s, l) => s + l.length, 0);
    for (let round = 0, added = 0; added < n; round++)
      for (const c of cats) {
        const m = byCat.get(c)![round];
        if (m) {
          out.push(m);
          added++;
        }
      }
  }
  return out;
}
