/**
 * Peppol BIS Ordering 3 (UBL 2.1 Order, transaction T01) export of a gateway order: the
 * credible path from this prototype to a real order network. Finnish organisations order
 * over Peppol (Finvoice covers invoices only). Party identifiers here are demo values,
 * marked as such; a real deployment uses each party's OVT code (EAS 0216).
 * Checked against the OASIS UBL-Order-2.1 schema and OpenPEPPOL's T01 schematron.
 */
import type { Order } from "@aimo/contracts";
import { getProduct, getRaw } from "../catalog.js";
import { getMandate } from "./service.js";
import { round2 } from "../util.js";

/** Aimo sales units to UN/ECE Rec 20 / Rec 21 ("X"-prefixed) codes on Peppol's list. */
export const UNIT_CODES: Record<string, string> = {
  ST: "EA", KPL: "EA", KI: "XCS", CS: "XCS", KG: "KGM", L: "LTR", PAK: "XPK", BAG: "XBG", RAS: "XBX", SK: "XSA", PRK: "XTB", BOT: "XBO", KRT: "XCT",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const amt = (n: number) => round2(n).toFixed(2);

/** GS1 mod-10 check for a GTIN-8/12/13/14. Only valid GTINs are sent (PEPPOL-COMMON-R040 style). */
function gtinOk(g: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(g)) return false;
  const d = g.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((s, x, i) => s + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function orderToUbl(o: Order): string {
  const m = getMandate(o.hotelId);
  const site = m.sites.find((s) => s.id === o.siteId) ?? m.sites[0];
  const live = o.lines.filter((l) => !l.removed && l.unitPrice !== null);
  const lineAmounts = live.map((l) => round2(l.quantity * l.unitPrice!));
  const lineExt = round2(lineAmounts.reduce((s, x) => s + x, 0));
  const tax = round2(live.reduce((s, l, i) => s + (lineAmounts[i] * (l.taxRate ?? 0)) / 100, 0));
  const [street, rest] = site.address.split(",").map((x) => x.trim());
  const postal = rest?.match(/\d{5}/)?.[0] ?? "00100";
  const city = rest?.replace(/\d{5}/, "").trim() || "Helsinki";
  const lines = live
    .map((l, i) => {
      const p = getProduct(l.productId);
      const gtin = String(getRaw(l.productId)?.gtin ?? "");
      const unit = UNIT_CODES[(l.salesUnit ?? "").toUpperCase()] ?? "EA";
      return `  <cac:OrderLine>
    <cac:LineItem>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:Quantity unitCode="${unit}">${l.quantity}</cbc:Quantity>
      <cbc:LineExtensionAmount currencyID="EUR">${amt(lineAmounts[i])}</cbc:LineExtensionAmount>
      <cbc:AccountingCost>${esc(l.outletId)}</cbc:AccountingCost>
      <cac:Price>
        <cbc:PriceAmount currencyID="EUR">${l.unitPrice}</cbc:PriceAmount>
      </cac:Price>
      <cac:Item>
        <cbc:Name>${esc(p?.name ?? l.productName)}</cbc:Name>
        <cac:SellersItemIdentification>
          <cbc:ID>${esc(l.productId)}</cbc:ID>
        </cac:SellersItemIdentification>${
          gtinOk(gtin)
            ? `
        <cac:StandardItemIdentification>
          <cbc:ID schemeID="0160">${gtin}</cbc:ID>
        </cac:StandardItemIdentification>`
            : ""
        }
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${l.taxRate ?? 0}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
    </cac:LineItem>
  </cac:OrderLine>`;
    })
    .join("\n");
  const placed = new Date(o.placedAt);
  // PEPPOL-T01-R002: the order is valid until the earliest line cut-off (Helsinki date).
  const cutoffs = live.map((l) => l.closingTime?.slice(0, 10)).filter((d): d is string => Boolean(d)).sort();
  const validTo = cutoffs[0] ?? o.deliveryDate;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2"
       xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
       xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:fdc:peppol.eu:poacc:trns:order:3</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:poacc:bis:ordering:3</cbc:ProfileID>
  <cbc:ID>${esc(o.id)}</cbc:ID>
  <cbc:IssueDate>${placed.toISOString().slice(0, 10)}</cbc:IssueDate>
  <cbc:IssueTime>${placed.toISOString().slice(11, 19)}</cbc:IssueTime>
  <cbc:OrderTypeCode>220</cbc:OrderTypeCode>
  <cbc:Note>Simulated order from the Potato Agent Gateway (Junction 2026). Version ${o.version}. Party identifiers are demo values.</cbc:Note>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:CustomerReference>${esc(m.customerNumber)}</cbc:CustomerReference>
  <cac:ValidityPeriod>
    <cbc:EndDate>${validTo}</cbc:EndDate>
  </cac:ValidityPeriod>
  <cac:QuotationDocumentReference>
    <cbc:ID>${esc(o.quoteId)}</cbc:ID>
  </cac:QuotationDocumentReference>
  <cac:BuyerCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0216">003712345671</cbc:EndpointID>
      <cac:PartyIdentification>
        <cbc:ID>${esc(m.customerNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${esc(site.name.split(",")[0])}</cbc:Name>
      </cac:PartyName>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(site.name.split(",")[0])} (demo)</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:BuyerCustomerParty>
  <cac:SellerSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0216">003798765432</cbc:EndpointID>
      <cac:PartyName>
        <cbc:Name>Valio Aimo (mock)</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>Helsinki</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>FI</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Valio Aimo (mock)</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:SellerSupplierParty>
  <cac:Delivery>
    <cac:DeliveryLocation>
      <cbc:Name>${esc(site.name)}</cbc:Name>
      <cac:Address>
        <cbc:StreetName>${esc(street ?? site.address)}</cbc:StreetName>
        <cbc:CityName>${esc(city)}</cbc:CityName>
        <cbc:PostalZone>${postal}</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>FI</cbc:IdentificationCode>
        </cac:Country>
      </cac:Address>
    </cac:DeliveryLocation>
    <cac:RequestedDeliveryPeriod>
      <cbc:StartDate>${o.deliveryDate}</cbc:StartDate>
      <cbc:EndDate>${o.deliveryDate}</cbc:EndDate>
    </cac:RequestedDeliveryPeriod>
  </cac:Delivery>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${amt(tax)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:AnticipatedMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${amt(lineExt)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${amt(lineExt)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${amt(lineExt + tax)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${amt(lineExt + tax)}</cbc:PayableAmount>
  </cac:AnticipatedMonetaryTotal>
${lines}
</Order>
`;
}
