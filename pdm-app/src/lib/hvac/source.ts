// Where the /hvac screens get their data.
//   live  (default): sign-in required; latest values from Firestore, history from TimescaleDB
//   sim:  the built-in plant simulation, no sign-in (local development, screenshots, demos)
// Set at build time with NEXT_PUBLIC_HVAC_SOURCE.

export type HvacSource = "live" | "sim";

export const HVAC_SOURCE: HvacSource = process.env.NEXT_PUBLIC_HVAC_SOURCE === "sim" ? "sim" : "live";
