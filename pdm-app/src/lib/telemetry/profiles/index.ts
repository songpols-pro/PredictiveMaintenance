// Device models written in code. services/ingest adds each one to the database (profiles, fault_bits)
// when the database does not have it, and never overwrites it: models live in the database and are
// edited on the admin page (/hvac/admin, Models tab). See ../register-map.ts.

import type { ModelDef } from "../register-map";
import { CARRIER_30RAM } from "./carrier-30ram";

export const SEED_MODELS: ModelDef[] = [CARRIER_30RAM];
