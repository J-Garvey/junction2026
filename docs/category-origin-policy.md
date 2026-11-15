# Demo Hotel's standing origin requirement

The signed `aimo.mandate.standing.1` returned by `GET /gateway/v1/mandate` includes optional `categoryOriginRequirements`. Demo Hotel seeds one entry requiring catalogue origin `fi` (Finland) for these **exact** category codes:

| Code | Products observed in the committed catalogue | Records |
|---|---|---:|
| 18701 | Fresh whole fish and fillets | 81 |
| 18702 | Smoked fish | 16 |
| 18705 | Herring and other preserved seafood | 59 |
| 18706 | Rainbow trout, trout and salmon fillets | 3 |
| 18707 | Grilled and flamed trout | 3 |
| 18708 | Marinated, cold-smoked and other prepared fish | 18 |
| 41720 | Frozen fish and fish preparations, including wedding SKU 469672 | 122 |
| 41722 | Frozen roe | 8 |
| 41723 | Frozen fish dishes and a mixed prepared-food bucket | 74 |

This is explicit **demo fixture policy**, based on the records in `data/products_slim.jsonl` and examples in `data/categories.csv`, not an official category-name dictionary. Category codes are undocumented upstream (GROUND_TRUTH section 4). Counts refer to the committed Junction extract.

The policy deliberately covers every product in these buckets, including their mixed contents: 18705 also contains octopus (e.g. 462557); 41723 also contains meat timbales (461743, 461754), vegan burgers (468987) and other prepared foods. The Rules page and signed mandate expose the exact codes; a name or fish-allergen declaration never changes the scope. Using AF to narrow the scope would let fish without allergen declarations escape it. A future finer product policy needs its own verified classification.

Excluded categories include chilled shellfish 18703, mixed caviar/seaweed 18704, frozen shellfish 41721, chilled meat 18710–18761, milk 10400 and beverages such as 85028. General ready meals, sauces and other categories containing fish ingredients are outside this category-scoped rule. This is not a claim that every fish ingredient anywhere in the catalogue has Finnish provenance. In particular, never use prefix `187` (it includes meat) or prefix `4172` (it includes shellfish).

Only the product's structured catalogue `origin` is evidence. Missing, empty or nonmatching origin fails with blocking, non-overridable `ORG-01`, including when an explicit SKU is requested. The rule does not establish the fish's catch location or the origin of every ingredient; the slim extract omits structured ingredient origins and fishing reports. Supplier names, Finnish text, brands and labels cannot substitute for country-of-origin evidence.

Search applies the rule before ranking and result limits, including cache keys. The hotel agent applies it when ranking and validating selected or staged products. The gateway independently checks it at quote creation, order commit and amendments, including unchanged retained lines. Commit reads the current mandate and catalogue; old quotes without `requires` do not bypass a newly applicable rule. Request/recipe constraints are evaluated alongside the standing rule, so conflicting origins cannot replace one another and diet/allergen/label checks remain in force. Changing the recipe-level ORG-01 outcome to Ask chef or presenting an approval cannot waive the standing requirement.

Older mandates with the field absent retain their original meaning and signature payload: no category origin restriction. An empty array has the same policy meaning. Existing saved plans and quotes need no migration; current checks apply when they are reviewed or committed. The Rules page shows an explicit empty state for older mandates. Resetting Demo Hotel restores the seeded rule; normal Rules edits preserve it in the newly signed mandate.

Regression checks use the saved supplier evidence in `data/fixtures/aimo/base.json`: Finnish 462016 and Norwegian 462150 (both category 18706), plus Finnish wedding fish 469672. Tests that remove or change catalogue origin explicitly identify those changes as synthetic drift fixtures and restore the catalogue afterward. No new supplier response or provenance is invented.
