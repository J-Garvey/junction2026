"""Infer hotel search tags from Aimo category codes and Finnish and English names."""

import re
from collections import defaultdict


RULES = defaultdict(list)


def add_rule(tags, categories, match=None, exclude=None):
    include = re.compile(match, re.IGNORECASE) if match else None
    omit = re.compile(exclude, re.IGNORECASE) if exclude else None
    for category in categories.split():
        RULES[category].append((tags.split(), include, omit))


# Broad categories work when the products share a clear use. Mixed categories
# use product names to separate the roles, such as drinking milk and coffee milk.
add_rule("breakfast:milk banquet:milk room_service:milk", "10400",
         exclude=r"soygurt|soijajogurt|sour\s*milk|piim[äa]|acidofilus|coffee|kahvimait|latte|caf[èé]|portion milk|annosmaito|kiehu")
add_rule("breakfast:coffee_milk banquet:coffee_milk room_service:coffee_milk", "10400",
         r"\bcoffee milk\b|kahvimaito|caf[èé] milk|portion milk|annosmaito",
         r"\blatte\b|coffee milk drink|maitokahvi")
add_rule("breakfast:yogurt_and_cultured_dairy", "10411 10412 10413 10430")
add_rule("breakfast:yogurt_and_cultured_dairy", "10400", r"soygurt|soijajogurt|sour\s*milk|piim[äa]|acidofilus")
add_rule("breakfast:plant_drinks banquet:plant_drinks room_service:plant_drinks", "10402",
         r"barista|ikaffe|(?:oat|soya?|almond|rice|coconut|pea|plant)\s*(?:based\s+)?drink|kaurajuoma|soijajuoma|mantelijuoma|riisijuoma|kookosjuoma")
add_rule("breakfast:eggs banquet:eggs room_service:eggs", "10590 10592")
add_rule("breakfast:bacon_and_sausage room_service:bacon_and_sausage", "17201 17202")
add_rule("breakfast:cheese_and_cold_cuts banquet:cheese_and_cold_cuts room_service:cheese_and_cold_cuts", "10602 17203 17204 17205")
add_rule("banquet:cheese_and_cold_cuts", "10600 10603 10630 10631 10632 10633 10635 10636 10637 10639 10640 10641 17206 17207 17208 41771")
add_rule("breakfast:bread banquet:bread room_service:bread", "10900 10901 10902 10903 21200 21211 41760 41761")
add_rule("breakfast:pastries banquet:pastries room_service:pastries", "41764")
add_rule("breakfast:pastries banquet:pastries room_service:pastries", "11030 41760 41761 41762 41763 41765 41766",
         r"croissant|voisarvi|cinnamon (?:bun|roll|swirl|whirl)|korvapuusti|danish pastry|viineri|waffle|vohveli|riisipiirakka|rice (?:pie|pasty|pastry)")
add_rule("breakfast:croissants banquet:croissants room_service:croissants", "11030 41760 41761 41762 41763 41764 41765 41766",
         r"croissant|voisarvi")
add_rule("breakfast:cereals_and_porridge room_service:cereals_and_porridge", "21370 21372 21373")
add_rule("breakfast:cereals_and_porridge room_service:cereals_and_porridge", "17300 17302 21371",
         r"porridge|oatmeal|puuro|semolina|mannasuurim")
add_rule("breakfast:butter_and_spreads room_service:butter_and_spreads", "10500 10501 10515 10516 21453")
add_rule("breakfast:butter_and_spreads room_service:butter_and_spreads", "21450 21452",
         r"\b(?:jam|preserve|marmalade|marmelade)\b|hill[oö]|marmeladi",
         r"chutney|chilli|chili|bakery|paistonkest|leipomo|devil|paholaisen|täyte|filling")
add_rule("breakfast:butter_and_spreads room_service:butter_and_spreads", "22150", exclude=r"honeycomb|hunajakenno")
add_rule("breakfast:fruit_and_berries banquet:fruit_and_berries room_service:fruit_and_berries", "17412 17413 17414 17445 17481")
add_rule("breakfast:fruit_and_berries banquet:fruit_and_berries", "41740 41741")
add_rule("breakfast:fruit_and_berries banquet:fruit_and_berries room_service:fruit_and_berries", "17411 17415",
         r"orange|mandarin|clementine|tangerine|grapefruit|melon|pineapple|mango|kiwi|persimmon|appelsiini|greippi|mandariini|meloni|ananas|kaki")
add_rule("breakfast:juice_and_smoothies banquet:juice_and_smoothies room_service:juice_and_smoothies", "21400 21402 21403 21404",
         r"juice|nectar|smoothie|fruit drink|mehu|nektari|pirtelö",
         r"lemon juice|lime juice|sitruunamehu|limemehu|\bconcentrate\b|tiiviste|glogg|glögi")
add_rule("breakfast:coffee_and_tea banquet:coffee_and_tea room_service:coffee_and_tea", "22300 22410 22411 22412 22530 22531")
add_rule("breakfast:coffee_and_tea banquet:coffee_and_tea room_service:coffee_and_tea", "41770", r"cafitesse|coffee|kahvi")
add_rule("breakfast:coffee_and_tea banquet:coffee_and_tea room_service:coffee_and_tea", "22540",
         r"hot chocolate|hot cocoa|kaakaojuoma|juomakaakao|tazza|cafitesse")
add_rule("breakfast:water banquet:water room_service:water", "22705 22706")

add_rule("banquet:meat_and_poultry", "17209 17210 18710 18720 18730 18740 18750 18751 18760 18761 41701 41702 41703 41704 41705 41710 41711 41712")
add_rule("banquet:fish_and_seafood", "18701 18702 18703 18704 18705 18706 18707 18708 41720 41721 41722 41723")
add_rule("room_service:fish_and_seafood", "18701 18702 18706 18707 18708 41720 41723",
         r"salmon|trout|cod|lohi|kirjolohi|turska|fish\s*(?:and|['’]n['’]?|&)\s*chips")
add_rule("banquet:vegetables_and_sides", "17401 17402 17403 17404 17405 17406 17407 17408 17421 17422 17423 17424 17431 17432 17433 17441 17442 17443 17444 17451 17452 17453 17454 17455 17456 17457 17471 17472 17473 41731 41732 41733 41734 41751")
add_rule("room_service:fries_and_sides", "41751 17423", r"fries|wedges|rosti|rösti|ranskanperun|lohkoperun")
add_rule("banquet:plant_proteins", "17306 41753 41754")
add_rule("banquet:pantry_and_sauces", "10401 10406 10418 10419 10530 10531 10532 21340 21380 21381 21382 21390 21590 21902 21903 21904 21905 21917 21918 21919 21920 21921")
add_rule("banquet:prepared_mains", "17300 17304 41755",
         r"lasagn|casserole|stew|curry|risotto|pasta|ravioli|tortello|meatballs|pata\b|kiusaus|laatikko|lihapull")
add_rule("banquet:soups room_service:soups", "21900 21901")
add_rule("banquet:soups room_service:soups", "17300 21510", r"\bsoup\b|keitto")
add_rule("banquet:salads room_service:salads", "17301 17441")
add_rule("banquet:appetizers", "17305")
add_rule("banquet:appetizers", "17302 41705 41753 41755 41762",
         r"cocktail|canap[ée]|tartlet|mini\b|falafel|croquette|terrine|samosa|spring roll|pienois|tapas|kevätkääryle")
add_rule("banquet:desserts", "10432 41763 41765 41820 41830")
add_rule("room_service:desserts", "10431 11030 41763 41765 41800 41801 41820 41830",
         r"cake|tart|brownie|cheesecake|ice.?cream|sorbet|pudding|mousse|fondant|tiramisu|kakku|jäätel|vanukas|crepe|lettu")

add_rule("room_service:sandwiches_and_wraps", "17303 41762",
         r"sandwich|panini|patonki|baguette|filled bread|flatbread|\bwrap\b|burrito|toastie|täytetty.*leipä|voileipä|kolmioleipä|rieskarulla")
add_rule("room_service:burgers", "10902 10903 17300 17306 18720 18761 41702 41705 41712 41753 41754 41755 41760 41761",
         r"burger|hampuril|smash\s*patt|burgerpihv")
add_rule("room_service:pizza", "17300 17303 41755 41762 41766",
         r"pizza|pitsa|pinsa|calzone", r"\bpizza (?:cheese|ham|sauce)\b|pizzajuusto|pizzakastike")
add_rule("room_service:pasta_and_mains", "17300 17304 41755",
         r"lasagn|casserole|risotto|pasta|ravioli|tortello|meatballs|makaron|kiusaus|laatikko|lihapull")
add_rule("room_service:pasta_and_mains", "18710 18720 18750 41710 41712 41754",
         r"tenderloin steak|sirloin steak|chicken breast fillet|broilerin rintafile|schnitzel|leike")
add_rule("room_service:condiments", "21910 21912 21918 22610")
add_rule("room_service:snacks", "21140 21150 21990 21992 21993 52200 52202")
add_rule("room_service:soft_drinks banquet:soft_drinks", "22413 22532 22700 22704")
add_rule("room_service:soft_drinks banquet:soft_drinks", "10400 22540",
         r"latte|coffee milk drink|maitokahvi|milk chocolate drink|suklaamaito")
add_rule("banquet:bar_drinks room_service:bar_drinks", "21405 22702 84966 84967 84988 85001 85028 85034")
add_rule("banquet:bar_ice room_service:bar_ice", "41770", r"ice (?:cubes|balls)|crushed ice|jääpal|jäämurs")

# Serviceware is deliberately kept under its own role so it stays out of food searches.
add_rule("breakfast:coffee_supplies banquet:coffee_supplies room_service:coffee_supplies", "63271")
add_rule("breakfast:coffee_supplies banquet:coffee_supplies room_service:coffee_supplies", "63900",
         r"bonamat|coffee (?:pot|filter)|kahvipannu|kahvisuodatin")
add_rule("banquet:buffet_equipment", "20012 20034")
add_rule("breakfast:buffet_equipment banquet:buffet_equipment", "20023 20033 63900",
         r"chaf|buffet|dispens[ce]|dispencer|bread basket|leipäkori|tarjoilu(?:vati|kulho)|serving (?:bowl|tray|platter)|lämpölevy|soup kettle")
add_rule("breakfast:tableware banquet:tableware room_service:tableware", "20031 20032 20035 63230 63231 63235 64000 64001 64002")
add_rule("banquet:table_linen", "63232")
add_rule("room_service:trays_and_jugs", "20033",
         r"serving tray|tarjotin|milk jug|cream jug|water jug|kermakko|maitokannu|vesikannu")
add_rule("room_service:meal_packaging", "64004",
         r"meal (?:box|tray|container)|food (?:box|tray|container)|take.?away|snack box|burger box|pizza box|sandwich box|ateriarasia|ruokarasia|annosrasia|hampurilaisrasia")
add_rule("room_service:meal_packaging", "64005 64007",
         r"snack bag|sandwich (?:bag|box)|baguette pocket|pizza box|pizzalaatikko|eväspussi|hampurilaispussi")


def hotel_tags(product):
    """Return sorted service tags and more specific tags for a slim product."""
    names = "\n".join(product[key] for key in ("en", "fi") if product.get(key))
    tags = set()
    for matches, include, exclude in RULES.get(product.get("cat"), ()):
        if include and not include.search(names):
            continue
        if exclude and exclude.search(names):
            continue
        tags.update(matches)
    tags.update(tag.split(":", 1)[0] for tag in tuple(tags))
    return sorted(tags)
