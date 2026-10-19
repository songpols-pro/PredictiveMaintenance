// Link devices to a device model (register profile), so the cloud can name the bits of their fault words.
// Models are in the database (profiles), edited on the admin page (/hvac/admin, Models tab); a device can
// also be given its model in the device list (admin page, npm run registry).
//
//   npm run set-profile -- --project hq-chiller --device "CH-*" --profile carrier-30ram
//   npm run set-profile -- --project hq-chiller --device CH-2 --profile none      (unlink)
//   npm run set-profile -- --project hq-chiller                                   (list devices)
//
// A device appears in the database after its first message. Linking takes effect from the next message.

import "./env";
import { parseArgs } from "node:util";
import { isMissingSchema, readModelSummaries } from "../../../pdm-app/src/lib/telemetry/register-store";
import { config } from "./config";
import { createPool } from "./db";

const { values: args } = parseArgs({
  options: {
    project: { type: "string" },
    device: { type: "string", default: "*" },
    profile: { type: "string" },
  },
});

const pool = createPool(config.databaseUrl, config.dbCaFile);
const models = await readModelSummaries(pool).catch(async (e) => {
  await pool.end();
  if (!isMissingSchema(e)) throw e;
  console.error("The database has no device models yet: run npm run migrate first.");
  process.exit(1);
});
const known = models.map((m) => `${m.id} (${m.kind})`).join(", ") || "(none)";

if (!args.project) {
  console.error('Usage: npm run set-profile -- --project <project> [--device "CH-*"] [--profile <id>|none]');
  console.error(`Profiles: ${known}`);
  await pool.end();
  process.exit(1);
}
if (args.profile && args.profile !== "none" && !models.some((m) => m.id === args.profile)) {
  console.error(`Unknown profile "${args.profile}". Profiles: ${known}`);
  await pool.end();
  process.exit(1);
}

// "*" is the wildcard; "_" and "%" in device ids are literal.
const pattern = args.device.replace(/[\\%_]/g, "\\$&").replace(/\*/g, "%");

const { rows } = args.profile
  ? await pool.query<{ device: string; gateway: string; profile: string | null }>(
      "UPDATE devices SET profile = $3 WHERE project = $1 AND device LIKE $2 RETURNING device, gateway, profile",
      [args.project, pattern, args.profile === "none" ? null : args.profile],
    )
  : await pool.query<{ device: string; gateway: string; profile: string | null }>(
      "SELECT device, gateway, profile FROM devices WHERE project = $1 AND device LIKE $2",
      [args.project, pattern],
    );

if (rows.length === 0) {
  console.log(`No device in project "${args.project}" matches "${args.device}". Devices appear after their first message.`);
} else {
  rows.sort((a, b) => a.device.localeCompare(b.device, "en", { numeric: true }));
  console.log(args.profile ? `Updated ${rows.length} device(s):` : `${rows.length} device(s):`);
  for (const r of rows) console.log(`  ${r.device.padEnd(12)} ${r.gateway.padEnd(10)} ${r.profile ?? "(no profile)"}`);
}
await pool.end();
