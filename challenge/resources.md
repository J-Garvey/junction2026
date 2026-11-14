# Challenge resources

The challenge brief is in `brief.txt`. The product data JSON schema is in `product_data_schema.json`.

## Data files (download, do not commit)

The data is synthetic but marked for Junction 2026 use only, and the product file is ~87 MB, so it isn't committed. Put downloads in `data/` (git-ignored).

- Product data (JSON): https://junction26.valioaimo.fi/files/32825daf25fcd6023c3b43028cf0b191/valio_aimo_junction26_product_data.json
- Product data schema: https://junction26.valioaimo.fi/files/008f9a50ba9a6538d2e5bdf29d592af8/valio_aimo_junction26_product_data_schema.json
- Delivery reliability (CSV): https://junction26.valioaimo.fi/files/fc0b960c5db8a49fb3b85e02a7f70b78/valio_aimo_junction26_delivery_reliability.csv
  - A value from 0 to 1 per product: how reliably orders were delivered as ordered. Not every product has one.
- Carbon footprint (CSV): https://junction26.valioaimo.fi/files/6d3b5d4ee6de9b5153b70beb27812efe/valio_aimo_junction26_carbon_footprint.csv
  - Column `AVG kg CO2-eq/kg`, an average for the product's product group, not a measurement of the individual product. Not every product has one.

## Mock APIs

- Pricing API: query prices for products.
- Availability API: check whether a product is available for a requested delivery date.
- Docs: Swagger UI https://junction26.valioaimo.fi/docs · ReDoc https://junction26.valioaimo.fi/redoc · OpenAPI JSON https://junction26.valioaimo.fi/openapi.json
- **Auth:** everything under `/api` needs an `X-API-Key` header. The key is on the Junction platform. **Never commit the key**; use a `.env` file.

## Mentors

| Area | Mentors |
|---|---|
| Marketplace / Commercial | Hanna Forsström, Pirjo Kaartinen |
| Online Sales (webshop) | Minni Ruhtinas |
| IT / Tech integrations & Data governance | Tommi Nurmi-Aro, Ville Takanen, Riku Tapper |
