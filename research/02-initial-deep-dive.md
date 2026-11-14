# Initial deep-dive (archived): public institutional kitchens + reusable design ideas

> **Status:** Our first research pass recommended public institutional kitchens (schools, daycare, hospitals). The team has since **ruled that segment out** because of heavy regulation and slow adoption. See [01-customer-options-brief.md](01-customer-options-brief.md).
> This file keeps the background facts and the design ideas that apply to *any* segment: the guardrails model, trust protocol, audit trail and demo pattern.

## Background facts on public kitchens (segment D, ruled out)

- Public kitchens serve about **380 million meals a year**. Public food purchasing is about **€350–600M a year** (MTK cites ~€350M; a Ministry of Agriculture deck at Hansel cites ~€600M).
- They buy on **tendered framework contracts**: suppliers bid once, then the buyer orders at fixed prices for several years, revised about once a year.
- Palvelukeskus Helsinki (the city's own catering company) works across ~500 sites and runs ~70% of the city's food services. Turku has 23 production, 68 service and 33 distribution kitchens.
- Up to a fifth of schoolchildren follow a special diet. Yle reported children hospitalised after allergen errors from school and daycare food (2019–2020), including oat yogurt served to a child with an oat allergy.
- In **Feb 2026 Helsinki voted 57–23 to halve meat and dairy purchases by 2030** ("Puolet parempaa" / "Half Better"). This is a strategic threat to Valio's dairy volume. Helsinki has also piloted carbon criteria in dairy and meat tenders.
- Wellbeing services counties (the regional authorities that run health and social care) must cover large deficits. Public employers made record layoffs.
- Many public kitchens use CGI Aromi or Jamix kitchen software, which already chains recipe → menu → purchase order. Aromi integrates with Synkka (the same GS1 product data source as our product file).

**Why it was ruled out:** public tenders and regulation make adoption slow, and Valio Aimo can only win these customers through tenders.

## Reusable: guardrails model (what the agent may do alone)

Adapt the thresholds to whichever segment we pick.

| Decision | Agent alone | Needs a human |
|---|---|---|
| Renew a standing order for contract/approved items, quantities within normal range | Yes | — |
| Quantity drift beyond threshold (e.g. +15% vs. 4-week average) or cost drift | — | Manager confirms before renewal |
| Like-for-like substitute: same category, identical and complete allergen statement, price within threshold | Yes, for non-diet orders | — |
| Any substitute on an order linked to a special diet | — | Dietitian / diet-responsible cook |
| Substitute or item where allergen data is **missing** | — | Always a human; missing data is never "free from" |
| Item outside the approved list | — | Purchasing |
| Order above the site's budget or a € threshold | — | Manager |
| Climate-driven swap (e.g. plant-based) | Proposes only | Manager / menu planner |

## Reusable: trust protocol (what each answer from Valio Aimo should carry)

- Contract or list price, price validity date, VAT class.
- Availability for the requested delivery date, including partial quantities.
- Historical delivery reliability where known, with a flag when it's low.
- Allergen statement with **source and last-updated timestamp** (GS1 Synkka), plus an explicit "unknown" state.
- Origin, labels (Finnish origin, Heart Symbol, organic, MSC/ASC) and the category-level CO₂ estimate, labelled as an estimate.

## Reusable: audit trail

One human-readable line per decision: what was asked, what was found, which rule allowed or blocked it, who approved it, and the trade-off (e.g. "+€0.12/L, same allergens, reliability 0.99 vs 0.87"). Both the buyer and Valio Aimo see the same log.

## Reusable: demo pattern

1. **Standing order**: renew routine items automatically; flag one site whose quantities crept up.
2. **Stock-out**: find a substitute; **block** it where it conflicts with a known allergy or diet, and route it to a human with a one-line explanation.
3. **The brief's example**: "1,000 L lactose-free milk by Monday", compared on price, availability and reliability, then ordered within authority.
4. **Audit log and report**: what was ordered, by whom or by which rule, plus origin share, Heart Symbol share and CO₂ estimate.

## Sources

- [MTK: public meals and spend](https://www.sttinfo.fi/tiedote/72388733/tuottajajarjestot-kotimainen-ruoka-on-investointi-ei-kuluera-380-miljoonaa-ateriaa-vuodessa?lang=fi)
- [Ministry deck at Hansel (~€600M)](https://www.hansel.fi/media/filer_public/19/2d/192d2239-bec6-4aca-883e-c014c8a1d757/mra2026_mmm_kestavat-valinnat-lautaselle.pdf)
- [Government: public food contract price revisions](https://valtioneuvosto.fi/-/1410837/julkisten-elintarvikehankintojen-hinnankorotukset-linjassa-ruuan-kuluttajahintamuutoksen-kanssa)
- [Helsinki: Palvelukeskus Helsinki](https://ahjojulkaisu.hel.fi/1F051E62-07E8-C15E-9417-8D8D1C600000.pdf) · [Turku kitchens](https://www.turku.fi/paatoksenteko/kaupunginvaltuusto/vastaus/hae/2474437)
- [Yle via Verkkouutiset: allergy incidents](https://www.verkkouutiset.fi/a/yle-lapsia-joutunut-hengenvaaraan-koulun-ja-paivakodin-ruuan-takia/) · [Special diets](https://core.ac.uk/download/146449026.pdf)
- [Helsinki "Half Better" vote](https://proteinproductiontechnology.com/post/helsinki-votes-to-halve-public-meat-and-dairy-purchases-by-2030) · [SYKE: Helsinki carbon criteria](https://hiilineutraalisuomi.syke.fi/en/projects/canemure/results-of-the-subprojects/city-of-helsinki/)
- [Yle: public-sector cuts](https://yle.fi/a/74-20209291)
- [CGI Aromi](https://www.cgi.com/fi/tuoteratkaisut/aromi) · [Aromi integrations](https://www.cgi.com/fi/fi/tuoteratkaisut/aromi/liittymat) · [Jamix](https://www.jamix.com/restaurant-inventory-management-system/)
