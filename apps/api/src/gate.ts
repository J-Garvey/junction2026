/**
 * Preview gate. When PREVIEW_PASSWORD is set, every route except /healthz and
 * /login needs either the gate cookie (browsers) or an X-Preview-Password
 * header (scripts and outside agents). Off when the variable is unset.
 */
import express, { type Request, type Response, type NextFunction, Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { hmac } from "./util.js";
import { config } from "./config.js";

const password = () => process.env.PREVIEW_PASSWORD ?? "";
const cookieValue = () => hmac(config.signingKey, `gate:${password()}`);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function hasCookie(req: Request) {
  const m = (req.header("cookie") ?? "").match(/(?:^|;\s*)aimo_gate=([^;]+)/);
  return Boolean(m && same(decodeURIComponent(m[1]), cookieValue()));
}

const page = (error: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aimo Copilot preview</title>
<style>body{font-family:"IBM Plex Sans",system-ui,sans-serif;background:#eeefe9;color:#23251d;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#fff;border:1px solid #bfc1b7;border-radius:6px;padding:28px;width:min(360px,90vw)}h1{font-size:20px;margin:0 0 6px}p{color:#4d4f46;font-size:14px;margin:0 0 16px}
input{width:100%;box-sizing:border-box;height:40px;border:1px solid #bfc1b7;border-radius:6px;padding:0 10px;font:inherit;margin-bottom:12px}
button{width:100%;height:40px;border:0;border-radius:6px;background:#f7a501;font-weight:700;font:inherit;cursor:pointer}.e{color:#cd4239}</style></head>
<body><form method="post" action="/login"><h1>Aimo Copilot preview</h1><p>Junction 2026 prototype. Enter the preview password.</p>
${error ? `<p class="e">${error}</p>` : ""}<input type="password" name="password" autofocus autocomplete="current-password" aria-label="Preview password"><button type="submit">Open</button></form></body></html>`;

export function gateRouter(): Router {
  const r = Router();
  r.get("/login", (_req, res) => res.type("html").send(page("")));
  r.post("/login", express.urlencoded({ extended: false }), (req, res) => {
    if (!password() || !same(String(req.body?.password ?? ""), password())) return res.status(401).type("html").send(page("That password is not right."));
    res.setHeader("Set-Cookie", `aimo_gate=${encodeURIComponent(cookieValue())}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1209600`);
    res.redirect(303, "/");
  });
  return r;
}

export function gate(req: Request, res: Response, next: NextFunction) {
  if (!password() || req.path === "/healthz" || req.path === "/login") return next();
  if (hasCookie(req)) return next();
  const h = req.header("x-preview-password");
  if (h && same(h, password())) return next();
  if (req.method === "GET" && (req.header("accept") ?? "").includes("text/html")) return res.redirect(302, "/login");
  res.status(401).json({ error: "forbidden", message: "This preview needs the X-Preview-Password header or a browser login at /login" });
}
