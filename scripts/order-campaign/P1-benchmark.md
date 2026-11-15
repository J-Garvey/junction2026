# P1 benchmark baseline: api-quality-20261115-c8a4

This change adds profiling tools only. Production parsing, search, planning and supplier logic are unchanged. The fixed development workload is independent of the campaign holdout, which P1 has not opened.

The full generic and known-SKU baselines are running. Final observations and artifact hashes will be added before this PR is marked ready. Early measurements and role-specific proposals are published at `C:/Users/benfh/junction-trials/api-quality-20261115-c8a4/P1/handoff.md`.

The seeded manifest has 30 samples in each of 1–10, 11–29, 30–59, 60–99 and 100 items, on web API and synthetic WhatsApp, then an identical second pass. Separate limit probes are preserved. Generic fixture failures, known-SKU planning, scripted-model checks and actual model smoke are separate evidence sets. No performance improvement or semantic pass verdict is claimed.

Tool checks: API typecheck passed; all 8 campaign tooling tests passed, including whole-workload preservation, minimum p95 sample counts, selection-overhead exclusion and planning-error stratification. The real-model smoke returned 3 provider HTTP200s, with actual usage telemetry; its sample size does not establish a p95.
