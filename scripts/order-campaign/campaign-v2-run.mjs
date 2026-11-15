/** Immutable-manifest adapter for run.mjs; no oracle-driven payload generation. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function loadManifest(path) {
  const bytes = readFileSync(path), ids = new Set();
  const records = bytes.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    let row; try { row = JSON.parse(line); } catch { throw Error(`Manifest line ${index + 1}: invalid JSON`); }
    if (!row || typeof row.caseId !== 'string' || !row.caseId || !Object.hasOwn(row, 'input') || !Object.hasOwn(row, 'expected')) throw Error(`Manifest line ${index + 1}: caseId, input and expected required`);
    if (ids.has(row.caseId)) throw Error(`Duplicate caseId: ${row.caseId}`);
    if (row.channels !== undefined && (!Array.isArray(row.channels) || !row.channels.length || row.channels.some(c => typeof c !== 'string'))) throw Error(`Invalid channels: ${row.caseId}`);
    if (row.channel !== undefined && typeof row.channel !== 'string') throw Error(`Invalid channel: ${row.caseId}`);
    ids.add(row.caseId);
    return [deepFreeze(row)];
  });
  if (!records.length) throw Error('Manifest is empty');
  return { path: resolve(path), sha256: createHash('sha256').update(bytes).digest('hex'), records: deepFreeze(records), bytes };
}

export function canonicalChannel(channel) {
  return ({ main: 'main', api: 'main', web: 'main', 'web-api': 'main', '/api': 'main',
    whatsapp: 'whatsapp', simulator: 'whatsapp', 'whatsapp-simulator': 'whatsapp',
    gateway: 'gateway', 'gateway-v1': 'gateway', '/gateway/v1': 'gateway' })[channel] || channel;
}

export function expandExecutions(records, requested) {
  const filter = requested?.split(',').map(canonicalChannel);
  return records.flatMap(record => [...new Set(record.channels || [record.channel || 'main'])]
    .filter(channel => !filter || filter.includes(canonicalChannel(channel)))
    .map(channel => ({ ...record, manifestChannel: channel, channel: canonicalChannel(channel), executionId: `${record.caseId}:${channel}` })));
}

export function resolveReferences(value, results) {
  if (Array.isArray(value)) return value.map(v => resolveReferences(v, results));
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.$ref === 'string') {
      const path = value.$ref.split('.');
      let result = results;
      for (const key of path) {
        if (['__proto__', 'constructor', 'prototype'].includes(key) || !result || !Object.hasOwn(result, key)) throw Error(`Unresolved reference: ${value.$ref}`);
        result = result[key];
      }
      return structuredClone(result);
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveReferences(v, results)]));
  }
  return value;
}

export function explicitSteps(c) {
  if (Array.isArray(c.sequence) && c.sequence.every(s => s && typeof s === 'object' && typeof s.path === 'string')) return c.sequence;
  if (c.input && typeof c.input === 'object' && typeof c.input.path === 'string') return [c.input];
  return null;
}

export async function executeSteps(c, send) {
  const steps = explicitSteps(c);
  if (!steps) return { unsupported: `Channel ${c.manifestChannel || c.channel} requires explicit structured HTTP steps; no natural-language gateway equivalent exists` };
  const results = Object.create(null), related = [];
  // Validate the entire sequence before any request; never silently truncate it.
  for (const step of steps) {
    const root = c.channel === 'gateway' ? '/gateway/v1/' : '/api/';
    const url = new URL(step.path, 'http://127.0.0.1');
    if (url.origin !== 'http://127.0.0.1' || !step.path.startsWith(root) || !url.pathname.startsWith(root) || step.path.includes('#')) throw Error(`Step outside ${root}: ${step.path}`);
    if (!['GET', 'POST'].includes(step.method || (step.body === undefined ? 'GET' : 'POST'))) throw Error('Only actual GET/POST contracts are supported');
    if (step.auth && !['chef', 'approver', 'agent', 'none'].includes(step.auth)) throw Error(`Unsupported auth role: ${step.auth}`);
    if (step.saveAs && !/^[A-Za-z][A-Za-z0-9_]*$/.test(step.saveAs)) throw Error('Invalid saveAs');
    if (Object.keys(step.headers || {}).some(k => k.toLowerCase() !== 'idempotency-key')) throw Error('Only Idempotency-Key may be supplied by a manifest');
  }
  for (const step of steps) {
    const resolved = resolveReferences(step, results);
    const r = await send(resolved);
    related.push({ ...r, purpose: 'manifest-explicit-http-step', saveAs: step.saveAs || null });
    if (step.saveAs) results[step.saveAs] = r.response;
  }
  return { related, main: related[0], results };
}
