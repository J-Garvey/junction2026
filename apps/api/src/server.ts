/** One Node service: the Aimo Agent Gateway (/gateway/v1), the hotel app API (/api) and the built web app. */
import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config, REPO_ROOT } from "./config.js";
import { getDb } from "./db.js";
import { loadCatalog } from "./catalog.js";
import { gatewayRouter, gatewayErrors } from "./gateway/routes.js";
import { buildOpenApi } from "./gateway/openapi.js";
import { appRouter, appErrors } from "./app/routes.js";
import { seedReset } from "./seed.js";
import { kvGet } from "./db.js";
import { gate, gateRouter } from "./gate.js";
import { jwks } from "./gateway/keys.js";
import { feedTap } from "./live/feed.js";
import { liveRouter } from "./live/routes.js";

export function createApp() {
  getDb();
  loadCatalog();
  if (!kvGet("agentToken")) seedReset();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(gateRouter());
  app.use(gate);
  app.use(express.json({ limit: "1mb" }));
  app.get("/openapi.json", (_req, res) => res.json(buildOpenApi()));
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  // RFC 9727 API catalog: how an agent finds this gateway's spec, docs and keys.
  app.get("/.well-known/api-catalog", (req, res) => {
    const origin = `${req.protocol}://${req.get("host")}`;
    res.type('application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"').send(
      JSON.stringify({
        linkset: [
          {
            anchor: `${origin}/gateway/v1`,
            "service-desc": [{ href: `${origin}/openapi.json`, type: "application/vnd.oai.openapi+json" }],
            "service-doc": [{ href: "https://github.com/J-Garvey/junction2026/blob/main/docs/build.md", type: "text/html" }],
            status: [{ href: `${origin}/healthz`, type: "application/json" }],
            "jwks-uri": [{ href: `${origin}/.well-known/jwks.json`, type: "application/jwk-set+json" }],
          },
        ],
      }),
    );
  });
  app.head("/.well-known/api-catalog", (req, res) => {
    res.setHeader("Link", `<${req.protocol}://${req.get("host")}/.well-known/api-catalog>; rel="api-catalog"`);
    res.end();
  });
  // Public keys for verifying every quote, order, approval and mandate the gateway signs (RFC 7517).
  app.get("/.well-known/jwks.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type("application/jwk-set+json").send(JSON.stringify(jwks()));
  });
  app.use("/gateway/v1", feedTap, gatewayRouter());
  app.use("/api/live", liveRouter());
  app.use("/api", appRouter());
  app.use(gatewayErrors);
  app.use(appErrors);
  const web = resolve(REPO_ROOT, "apps/app/dist");
  if (existsSync(web)) {
    app.use(express.static(web));
    app.get(/^\/(?!api|gateway).*/, (_req, res) => res.sendFile(resolve(web, "index.html")));
  }
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal", message: (err as Error).message });
  });
  return app;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("server.ts")) {
  const app = createApp();
  app.listen(config.port, "127.0.0.1", () => console.log(`Aimo Copilot on http://127.0.0.1:${config.port}  (gateway /gateway/v1, spec /openapi.json)`));
}
