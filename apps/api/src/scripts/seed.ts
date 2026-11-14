import { seedReset, SEED_PROFILES, type SeedProfileId } from "../seed.js";
// pnpm seed [gala|wedding]; without an argument it uses AIMO_SEED, then the last seed.
const arg = process.argv[2] as SeedProfileId | undefined;
if (arg && !SEED_PROFILES[arg]) throw new Error(`Unknown seed "${arg}". Use one of: ${Object.keys(SEED_PROFILES).join(", ")}`);
seedReset(arg);
console.log(`Seeded a fresh database${arg ? ` (${arg})` : ""}.`);
