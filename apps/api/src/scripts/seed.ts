import { seedReset } from "../seed.js";
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const profile = args.length === 0 ? "story" : args.length === 2 && args[0] === "--profile" ? args[1] : null;
if (profile !== "story" && profile !== "hotel") throw new Error("Usage: pnpm seed [--profile story|hotel]");
if (profile === "story") {
  seedReset();
  console.log("Seeded the wedding story at scene 1.");
} else {
  const { createApp } = await import("../server.js");
  const { config } = await import("../config.js");
  const { seedHotelWorkspace } = await import("../seed-workspace.js");
  // Use an ephemeral loopback port and this process's own database. No second app/database is needed.
  const server = createApp().listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    config.gatewayUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/gateway/v1`;
    await seedHotelWorkspace();
    console.log("Seeded the hotel workspace: 7 bookings, a signed order, finance review, stock question, allergy block and draft menus. Clock: 11 Nov 2026, 10:00 Helsinki. All activity is fictional fixture data.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}
