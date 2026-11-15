import { Router } from "express";
import { z } from "zod";
import { resolveToken, tokenFrom, type Person } from "../identity.js";
import { WhatsAppWebBridge, WhatsAppWebError } from "./web.js";

export function whatsappWebRouter(bridge: WhatsAppWebBridge): Router {
  const r = Router();
  r.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    let identity;
    try { identity = resolveToken(tokenFrom(req)); } catch { /* Invalid cookie. */ }
    if (identity?.kind !== "person") return res.status(401).json({ error: "Pick who you are viewing as" });
    res.locals.whatsappPerson = identity.person;
    res.locals.whatsappToken = identity.token;
    next();
  });
  r.get("/status", (_req, res) => res.json(bridge.status(res.locals.whatsappPerson as Person)));
  r.post("/connect", async (_req, res) => res.json(await bridge.connect(res.locals.whatsappPerson as Person, res.locals.whatsappToken as string)));
  r.post("/disconnect", async (_req, res) => res.json(await bridge.disconnect(res.locals.whatsappPerson as Person)));
  r.post("/groups/refresh", async (_req, res) => res.json(await bridge.refreshGroups(res.locals.whatsappPerson as Person)));
  r.post("/group", (req, res) => {
    const body = z.object({ groupId: z.string().max(128).nullable() }).strict().parse(req.body);
    res.json(bridge.selectGroup(res.locals.whatsappPerson as Person, body.groupId));
  });
  r.use((err: unknown, _req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    if (err instanceof WhatsAppWebError) return res.status(err.status).json({ error: err.message });
    next(err);
  });
  return r;
}
