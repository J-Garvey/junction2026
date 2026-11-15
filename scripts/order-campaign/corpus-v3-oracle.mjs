/** A2 authored source/policy oracle. No production parser, planner or responses. */
export const clock = '2026-11-14T10:00:00Z';
export const money = n => Math.round((n + Number.EPSILON) * 100) / 100;
export const whole = n => Math.ceil(n - 1e-10);
export function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
}
function priceBoundary(s, end = false) {
  if (typeof s !== 'string' || !validDate(s.slice(0, 10))) return null;
  if (s.length === 10) return { day: s, time: Date.parse(`${s}T${end ? '23:59:59.999' : '00:00:00'}Z`) };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(s) || !Number.isFinite(Date.parse(s))) return null;
  return { day: s.slice(0, 10), time: Date.parse(s) };
}
export function normalize(line) {
  const units = { l: ['L', 1], ml: ['L', .001], dl: ['L', .1], kg: ['KG', 1], g: ['KG', .001], pcs: ['PCS', 1] };
  const u = units[line.unit];
  return { normalizedUnit: u?.[0] ?? null, normalizedAmount: u && Number.isFinite(line.amount) ? line.amount * u[1] : null };
}

/** Money rounded to cents corroborates an exact manufacturer amount; it cannot define it. */
export function packFact(product, price, availability, dimension) {
  const salesUnit = availability?.scheduleLines?.[0]?.salesUnit;
  const multiplier = product?.units?.[salesUnit];
  const result = { salesUnit: salesUnit ?? null, baseUnitsPerSalesUnit: multiplier ?? null, packSize: null, status: 'unknown', reason: 'missing_sales_unit_hierarchy' };
  if (!product || salesUnit === 'ZML' || !(multiplier > 0)) return result;
  if (dimension === 'PCS' && product.bu === 'ST') return { ...result, packSize: multiplier, status: 'verified', reason: 'documented_ST_count_and_API_sales_unit' };
  if (!['L', 'KG'].includes(dimension)) return { ...result, reason: 'unsupported_dimension' };
  const manufacturer = product.net_src === 'synkka' || dimension === 'KG' && product.net_src === 'synkka+name';
  const net = dimension === 'L' ? product.net_l : product.net_kg;
  if (!manufacturer || !(net > 0)) return { ...result, reason: 'manufacturer_content_unverified' };
  if (product.var_weight) return { ...result, reason: 'variable_weight_requires_individual_terms' };
  const exact = net * multiplier;
  const comparison = price?.comparisonPrice?.value;
  if (price?.error || !(price?.catalogPrice?.value > 0) || !(comparison > 0) || price.comparisonUnit?.toUpperCase() !== dimension) return { ...result, reason: 'comparison_corroboration_missing' };
  const discrepancy = Math.abs(price.catalogPrice.value / exact - comparison);
  if (discrepancy > .005000001) return { ...result, reason: 'manufacturer_API_comparison_conflict', candidateManufacturerPack: exact, comparisonDiscrepancyEur: discrepancy };
  return { ...result, packSize: exact, status: 'verified', reason: 'manufacturer_and_API_with_half_cent_tolerance', comparisonDiscrepancyEur: discrepancy };
}

export function oracleForLine(line, product, price, availability, neededBy = '2026-11-16', now = clock) {
  const blocks = [], questions = [], unknowns = [];
  const norm = normalize(line), pack = packFact(product, price, availability, norm.normalizedUnit);
  if (!product) blocks.push('unknown_product');
  for (const c of line.claims || []) if (!(product?.claims || []).includes(c)) blocks.push(`missing_claim:${c}`);
  for (const a of line.avoidAllergens || []) {
    if ([...(product?.contains || []), ...(product?.may_contain || [])].includes(a)) blocks.push(`allergen:${a}`);
    else if (!product?.has_allergen_data || !(product.free_from || []).includes(a)) blocks.push(`allergen_safety_unproven:${a}`);
  }
  if (line.origin && product?.origin !== line.origin) blocks.push('origin_requirement_unmet');
  if (neededBy == null) questions.push('delivery_date_required');
  else if (!validDate(neededBy)) blocks.push('invalid_requested_date');
  else if (neededBy < now.slice(0, 10)) blocks.push('past_requested_date');
  if (!(norm.normalizedAmount > 0)) blocks.push('invalid_or_missing_quantity');
  if (!norm.normalizedUnit) unknowns.push('unsupported_quantity_unit');
  if (!price) unknowns.push('fixture_price_missing');
  const cp = price?.catalogPrice;
  let priceValid = false;
  if (price && (price.error || !Number.isFinite(cp?.value) || cp.value < 0 || cp.currency !== 'EUR')) blocks.push('price_unavailable');
  else if (price) {
    const from = priceBoundary(cp?.validFrom), to = priceBoundary(cp?.validTo, true);
    if (!from || !to || from.time > to.time) unknowns.push('price_validity_unverified');
    else {
      priceValid = from.time <= Date.parse(now) && Date.parse(now) <= to.time && (!validDate(neededBy) || from.day <= neededBy && neededBy <= to.day);
      if (!priceValid) questions.push('price_not_valid_at_commit_or_delivery');
    }
  }
  const s = availability?.scheduleLines?.[0];
  const dateValid = validDate(s?.availableDate);
  if (!availability) unknowns.push('fixture_stock_missing');
  else {
    if (availability.salesBlock || s?.salesBlock) blocks.push('sales_block');
    if (!s) blocks.push('no_delivery_date');
    else if (!dateValid) blocks.push('missing_or_invalid_delivery_date');
    else if (validDate(neededBy) && s.availableDate !== neededBy) questions.push(s.availableDate > neededBy ? 'delivery_later_than_requested' : 'delivery_date_differs');
    const cutoff = priceBoundary(availability.closingTime);
    if (!cutoff || availability.closingTime.length === 10) unknowns.push('cutoff_unverified');
    else if (cutoff.time <= Date.parse(now)) blocks.push('expired_cutoff');
  }
  const sentinel = s && (availability.logisticModel === 'Terminal' && s.availableAmount === 999999 || s.availableAmount === 9999999999 || pack.baseUnitsPerSalesUnit > 0 && Math.abs(s.availableAmount * pack.baseUnitsPerSalesUnit - 9999999999) < 10);
  const stockKnown = dateValid && availability?.logisticModel === 'Stock' && pack.baseUnitsPerSalesUnit > 0 && Number.isFinite(s?.availableAmount) && s.availableAmount >= 0 && !sentinel;
  if (sentinel) questions.push('builder_continue_unknown_stock');
  if (s && !stockKnown && !sentinel) unknowns.push('stock_quantity_or_date_unverified');
  if (pack.status !== 'verified') unknowns.push('pack_conversion_unverified');
  const packs = pack.packSize > 0 && norm.normalizedAmount > 0 ? whole(norm.normalizedAmount / pack.packSize) : null;
  // Validity failures do not erase an observed quote; they prevent commitment to it.
  const totalEur = packs !== null && Number.isFinite(cp?.value) && !price.error ? money(packs * cp.value) : null;
  if (stockKnown && packs !== null && packs > s.availableAmount) questions.push('partial_fill');
  if (packs !== null && Number.isFinite(cp?.value)) {
    const excess = packs * pack.packSize - norm.normalizedAmount;
    if (excess / norm.normalizedAmount > .1 && excess / pack.packSize * cp.value > 25) questions.push('rounding_over_policy_tolerance');
  }
  return { blocks, questions, unknowns, ...norm, packEvidence: pack, packSize: pack.packSize, packs, totalEur,
    stock: stockKnown ? 'confirmed_fixture_quantity' : 'unknown', availableSalesUnits: stockKnown ? s.availableAmount : null,
    salesUnit: s?.salesUnit ?? null, availableDate: dateValid ? s.availableDate : null, closingTime: availability?.closingTime ?? null,
    priceValidity: { validFrom: cp?.validFrom ?? null, validTo: cp?.validTo ?? null, commitAndDeliveryCovered: priceValid },
    commitAllowed: blocks.length + questions.length + unknowns.length === 0 };
}

export function sharedStock(lines) {
  const groups = Map.groupBy(lines, l => l.productId);
  return [...groups].filter(([, ls]) => ls.length > 1).map(([productId, ls]) => {
    const first = ls[0].fixtureOracle;
    const comparable = first.packSize > 0 && ls.every(l => l.fixtureOracle.normalizedUnit === first.normalizedUnit && l.fixtureOracle.packSize === first.packSize && l.fixtureOracle.normalizedAmount > 0);
    const sameRequirements = new Set(ls.map(l => JSON.stringify({ claims: [...l.claims].sort(), avoid: [...l.avoidAllergens].sort(), origin: l.origin || null }))).size === 1;
    const compatiblePacks = comparable ? whole(ls.reduce((n, l) => n + l.fixtureOracle.normalizedAmount, 0) / first.packSize) : null;
    return { productId, lineIds: ls.map(l => l.lineId), availableSalesUnits: first.availableSalesUnits,
      // Incompatible positions remain distinct; their rounded requirements consume the same stock.
      minimumSalesUnitsNeeded: comparable ? sameRequirements ? compatiblePacks : ls.reduce((n, l) => n + l.fixtureOracle.packs, 0) : null,
      compatibleRequirements: sameRequirements, mustNotDoubleCountStock: true, mustNotInventDensity: !comparable };
  });
}
