#!/usr/bin/env python3
"""Minimal client for the Valio Aimo Junction 2026 mock API (stdlib only).

  export AIMO_API_KEY=...            # or put it in .env at the repo root
  python3 scripts/aimo_api.py ping
  python3 scripts/aimo_api.py availability 2026-11-16 462921 464201
  python3 scripts/aimo_api.py price 2026-11-16 462921 464201

The API is read-only: there is no order endpoint. Max 1000 product codes per call.
Rate limits are undisclosed: shortlist with data/products_slim.jsonl first, then query.
"""
import json
import os
import sys
import urllib.request

BASE = "https://junction26.valioaimo.fi"


def _key():
    k = os.environ.get("AIMO_API_KEY")
    if not k:
        env = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
        if os.path.exists(env):
            for line in open(env):
                if line.startswith("AIMO_API_KEY="):
                    k = line.split("=", 1)[1].strip()
    if not k:
        raise SystemExit("Set AIMO_API_KEY")
    return k


def _call(path, body=None):
    req = urllib.request.Request(BASE + path, method="POST" if body is not None else "GET",
                                 data=json.dumps(body).encode() if body is not None else None,
                                 # The server answers 403 to Python's default "Python-urllib" User-Agent.
                                 headers={"X-API-Key": _key(), "Content-Type": "application/json",
                                          "Accept": "application/json", "User-Agent": "aimo-api-client/0.1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def ping():
    return _call("/api/ping")


def _query(path, products, requested_date, customer):
    products = [str(p) for p in products]
    out = None
    for i in range(0, len(products), 1000):  # API limit: 1000 codes per request
        res = _call(path, {"customer": customer, "requestedDate": requested_date, "products": products[i:i + 1000]})
        if out is None:
            out = res
        else:
            out["products"].extend(res["products"])
    return out


def availability(products, requested_date, customer="123"):
    """requested_date: 'YYYY-MM-DD' desired delivery date."""
    return _query("/api/availability", products, requested_date, customer)


def price(products, requested_date, customer="123"):
    return _query("/api/price", products, requested_date, customer)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "ping"
    if cmd == "ping":
        res = ping()
    else:
        res = {"availability": availability, "price": price}[cmd](sys.argv[3:], sys.argv[2])
    print(json.dumps(res, indent=2, ensure_ascii=False))
