# Challenge resources

The challenge brief is in `brief.txt`. The product data JSON schema is in `product_data_schema.json`.

> **Repo state (14 Nov 2026):** the slim dataset built from these files *is* committed in `../data/`, and `.env` is committed too; the repo is private. Whether to keep them committed is an open team decision (see question 3 in `../QUESTIONS.md`). The raw 87 MB catalogue is not committed: `../scripts/fetch_raw.sh` downloads it into `data/raw/`.

## Data files

The data is synthetic but marked for Junction 2026 use only. The raw product file is ~87 MB and isn't committed. `scripts/fetch_raw.sh` downloads all three raw files into `data/raw/` (git-ignored) through the API's `/api/products/download`, `/api/delivery-reliability/download` and `/api/carbon-footprint/download` endpoints, which redirect to the direct links below.

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
- **Auth:** everything under `/api` needs an `X-API-Key` header. The key is on the Junction platform and in `.env` as `AIMO_API_KEY` (currently committed; see question 3 in `../QUESTIONS.md`).
- **Behaviour:** read-only, no order endpoint. Observed response formats are recorded in `../CLAUDE.md` and `../research/03-data-profile.md`. Python's default user-agent gets HTTP 403; `scripts/aimo_api.py` sends its own.

## Mentors

| Area | Mentors |
|---|---|
| Marketplace / Commercial | Hanna Forsström, Pirjo Kaartinen |
| Online Sales (webshop) | Minni Ruhtinas |
| IT / Tech integrations & Data governance | Tommi Nurmi-Aro, Ville Takanen, Riku Tapper |
