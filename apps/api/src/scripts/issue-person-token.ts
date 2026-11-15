/** Operator-only provisioning after verifying the person out of band. Never expose as HTTP. */
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { getPerson, issueToken } from "../identity.js";
const [personId, output] = process.argv.slice(2);
if (!personId || !output || !getPerson(personId)) throw new Error("Usage: tsx src/scripts/issue-person-token.ts <existing-person-id> <private-output-file>");
const token = issueToken({ kind: "person", personId, testSession: false });
writeFileSync(resolve(output), token + "\n", { mode: 0o600, flag: "wx" });
console.log("Personal credential written to the operator-selected file. Keep it private.");
