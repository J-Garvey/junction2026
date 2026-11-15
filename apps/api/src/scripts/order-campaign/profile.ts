/** Opt-in fixture-host profiling only; no payloads, credentials, or production hooks. */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Express } from 'express';

export function installProfile(app: Express) {
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const requests: Record<string, unknown>[] = [];
  app.get('/campaign/profile', (req, res) => {
    const since = Number(req.query.since ?? 0);
    if (!Number.isSafeInteger(since) || since < 0) return res.status(400).json({ error: 'invalid profile cursor' });
    res.json({ count: requests.length, requests: requests.slice(since), rssBytes: process.memoryUsage().rss,
      eventLoop: { scope: 'since profiling enabled; includes setup and idle', resolutionMs: 10,
        meanMs: Number.isFinite(loop.mean) ? loop.mean / 1e6 : null, maxMs: loop.max / 1e6, p99Ms: loop.percentile(99) / 1e6 } });
  });
  app.use((req, res, next) => {
    const started = performance.now(), cpu = process.cpuUsage(), rssBeforeBytes = process.memoryUsage().rss, path = req.path;
    let resJsonSyncMs = 0;
    const original = res.json;
    res.json = function (body) {
      const start = performance.now();
      try { return original.call(this, body); }
      finally { resJsonSyncMs += performance.now() - start; }
    };
    res.once('finish', () => {
      const used = process.cpuUsage(cpu);
      requests.push({ attempt: String(req.headers['x-campaign-attempt'] ?? 'support'), method: req.method,
        path, status: res.statusCode, elapsedMs: performance.now() - started,
        resJsonSyncMs, cpuProcessMs: (used.user + used.system) / 1000,
        rssBeforeBytes, rssAfterBytes: process.memoryUsage().rss });
    });
    next();
  });
  return () => loop.disable();
}
