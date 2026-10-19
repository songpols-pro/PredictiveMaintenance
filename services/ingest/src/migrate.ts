// Apply the schema without starting the service: npm run migrate

import "./env";
import { config } from "./config";
import { createPool } from "./db";
import { migrate } from "./schema";

const pool = createPool(config.databaseUrl, config.dbCaFile);
const done = await migrate(pool, { compressAfter: config.compressAfter, retention: config.retention });
console.log(`Schema up to date: ${done.join(", ")}`);
await pool.end();
