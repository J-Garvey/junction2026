import { appendFileSync } from 'node:fs';

const credentialField = /^(?:authorization|cookie|set-cookie|token|agentToken|api[_-]?key|.*password|.*secret|qrDataUrl)$/i;

/** Keep complete payloads; remove credentials rather than truncating evidence. */
export function sanitize(value, secrets = []) {
  const hidden = [...secrets, ...Object.entries(process.env)
    .filter(([key, val]) => /(?:KEY|PASSWORD|SECRET|TOKEN)$/.test(key) && val?.length > 8)
    .map(([, val]) => val)].filter(Boolean);
  const text = (s) => {
    for (const secret of hidden) s = s.replaceAll(secret, '[credential omitted]');
    return s.replace(/sk-[A-Za-z0-9_*.-]{6,}/g, '[key omitted]')
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [credential omitted]')
      .replace(/("(?:token|agentToken|authorization|cookie|set-cookie|api[_-]?key|[^"\s]*password|[^"\s]*secret|qrDataUrl)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[credential omitted]"');
  };
  const visit = (v) => {
    if (typeof v === 'string') return text(v);
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v)
      .map(([k, child]) => [k, credentialField.test(k) ? '[credential omitted]' : visit(child)]));
    return v;
  };
  return visit(value);
}

export function appendEvidence(path, row, secrets = []) {
  appendFileSync(path, JSON.stringify(sanitize(row, secrets)) + '\n', { flush: true });
}
