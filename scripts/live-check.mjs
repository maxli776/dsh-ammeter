/**
 * Live end-to-end check: run the Host half against the real subscription
 * usage APIs with the keys from this machine's DSH credential store, and
 * print the JSON snapshot the Web UI would receive. No key is ever printed.
 *
 *   node scripts/live-check.mjs
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { UsageService } from "../dist/service.js";

const yaml = readFileSync(join(homedir(), ".dsh", ".credentials.yaml"), "utf8");
const keyOf = (name) => {
  const match = yaml.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, "m"));
  if (!match) return undefined;
  const value = match[1].trim().replace(/^["']|["']$/g, "");
  return value.length > 0 ? value : undefined;
};

const credentials = {
  async resolve(ref) {
    const value = keyOf(ref);
    return value === undefined ? undefined : { value };
  },
};

const service = new UsageService(
  { get: (name) => (name === "credentials" ? credentials : undefined) },
  { env: {} },
);
service.markReady();
const snapshot = await service.snapshot(true, "manual");
console.log(JSON.stringify(snapshot, null, 2));
