import { allProducts } from "../catalog.js";
import { buildCategoryTags, tagCategories, didYouMean } from "../categoryTags.js";
const all = allProducts();
const b = buildCategoryTags(all);
let empty = 0;
for (const c of b.cats.values()) if (!c.en.length) empty++;
console.log("cats", b.cats.size, "without en tags", empty);
for (const w of (process.argv[2] ?? "bean house cake pepper water honey lettuce cucumber pea chickpea lentil tofu spaghetti pancake hummus avocado egg flour onion birthday sparkling").split(" "))
  console.log(w.padEnd(10), tagCategories(w, all).map((t) => `${t.category}:${t.n}/${b.cats.get(t.category)!.size}(f${t.focus})`).join(" "));
for (const c of ["41763", "21594", "22410", "41830", "21120", "10600", "17408"]) { const x = b.cats.get(c)!; console.log(c, x.size, "EN", x.en.map((t) => t.word + ":" + t.n).join(" "), "| FI", x.fi.map((t) => t.word + ":" + t.n).join(" ")); }
console.log(didYouMean("chese", all), didYouMean("strawbery", all), didYouMean("tomatos", all));
import { fiToEn, enToFi } from "../categoryTags.js";
for (const w of "kakku papu herne kikherne linssi kurkku hunaja vesi pippuri tomaatti peruna leipä juusto kerma mansikka sipuli salaatti riisi pasta".split(" ")) console.log("fi→en", w, fiToEn(w, all));
for (const w of "bean pea chickpea lentil cucumber honey water pepper tofu spaghetti avocado lettuce hummus cake pancake".split(" ")) console.log("en→fi", w, enToFi(w, all));
