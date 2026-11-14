#!/usr/bin/env bash
# Downloads the raw challenge files into data/raw/ and rebuilds the slim dataset.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
B=https://junction26.valioaimo.fi
mkdir -p data/raw
curl -fL -H "X-API-Key: $AIMO_API_KEY" "$B/api/products/download" -o data/raw/product_data.json
curl -fL -H "X-API-Key: $AIMO_API_KEY" "$B/api/carbon-footprint/download" -o data/raw/carbon_footprint.csv
curl -fL -H "X-API-Key: $AIMO_API_KEY" "$B/api/delivery-reliability/download" -o data/raw/delivery_reliability.csv
python3 scripts/build_slim.py data/raw/product_data.json data/raw/carbon_footprint.csv data/raw/delivery_reliability.csv data
