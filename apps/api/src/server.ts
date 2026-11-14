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
  app.use("/gateway/v1", gatewayRouter());
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
