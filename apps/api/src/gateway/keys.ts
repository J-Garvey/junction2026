/**
 * Public-key signatures any outside agent can verify without a shared secret.
 * Compact JWS (RFC 7515) with ES256 (ECDSA P-256, RFC 7518), the algorithm AP2
 * v0.2 requires for a merchant-signed checkout (it rules out deterministic
 * schemes such as Ed25519) and that UCP uses. A JWT claim set (RFC 7519),
 * explicit typ per object (RFC 8725 §3.11), and the public key published as a
 * JWKS (RFC 7517) at /.well-known/jwks.json with an RFC 7638 thumbprint as kid.
 * node:crypto only.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, randomUUID, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { REPO_ROOT } from "../config.js";
import { now } from "../clock.js";

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** RFC 8785 JCS for plain JSON: keys sorted by UTF-16 code units, ES number serialisation. */
export function jcs(v: unknown): string {
  if (v === null || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new TypeError("JCS: non-finite number");
    return JSON.stringify(v);
  }
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(jcs).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(o[k])}`).join(",")}}`;
  }
  throw new TypeError(`JCS: unsupported type ${typeof v}`);
}

export const keyFile = () => process.env.GATEWAY_SIGNING_KEY_FILE ?? resolve(REPO_ROOT, "apps/api/var/signing-key-es256.pem");
export const ALG = "ES256";

let cached: { priv: KeyObject; pub: KeyObject; kid: string; jwk: Record<string, string> } | null = null;

function keys() {
  if (cached) return cached;
  const path = keyFile();
  let priv: KeyObject;
  if (existsSync(path)) priv = createPrivateKey(readFileSync(path, "utf8"));
  else {
    priv = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, priv.export({ type: "pkcs8", format: "pem" }) as string, { mode: 0o600, flag: "wx" });
  }
  const pub = createPublicKey(priv);
  const { crv, kty, x, y } = pub.export({ format: "jwk" }) as { crv: string; kty: string; x: string; y: string };
  // RFC 7638: required members in lexicographic order, no whitespace.
  const kid = b64u(createHash("sha256").update(JSON.stringify({ crv, kty, x, y })).digest());
  cached = { priv, pub, kid, jwk: { kty, crv, x, y, kid, use: "sig", alg: ALG } };
  return cached;
}

export const jwks = () => ({ keys: [keys().jwk] });
export const issuer = () => process.env.GATEWAY_ISSUER ?? "https://aimo-copilot-j26.bestinhop23.com";

export type JwtType = "aimo-quote+jwt" | "aimo-order+jwt" | "aimo-approval+jwt" | "aimo-mandate+jwt";

/** AP2 v0.2 checkout_hash: base64url(SHA-256(checkout_jwt)). */
export const checkoutHash = (jwt: string) => b64u(createHash("sha256").update(jwt, "ascii").digest());

/** Sign a JWT claim set. iat/nbf come from the simulated clock so expiry matches the demo's cut-offs. */
export function signJwt(typ: JwtType, claims: Record<string, unknown>, opts: { expiresAt?: string; sub?: string; aud?: string; jti?: string } = {}): string {
  const k = keys();
  const iat = Math.floor(now().getTime() / 1000);
  const payload = {
    iss: issuer(),
    sub: opts.sub,
    aud: opts.aud,
    iat,
    nbf: iat,
    exp: opts.expiresAt ? Math.floor(new Date(opts.expiresAt).getTime() / 1000) : undefined,
    jti: opts.jti ?? randomUUID(),
    ...claims,
  };
  const input = `${b64u(JSON.stringify({ alg: ALG, kid: k.kid, typ }))}.${b64u(jcs(payload))}`;
  // JWS ES256 signatures are raw r||s (64 bytes), not DER.
  return `${input}.${b64u(sign("sha256", Buffer.from(input, "ascii"), { key: k.priv, dsaEncoding: "ieee-p1363" }))}`;
}

/** Verify signature, alg, kid and typ. Time claims are checked by the caller against the simulated clock. */
export function verifyJwt(token: string, typ: JwtType): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const k = keys();
    if (header.alg !== ALG || header.kid !== k.kid || header.typ !== typ || header.crit) return null;
    if (!verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`, "ascii"), { key: k.pub, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"))) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
