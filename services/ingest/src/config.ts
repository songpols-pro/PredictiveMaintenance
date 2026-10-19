// Settings from the environment (.env locally, service variables and secrets on Cloud Run).

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

/** Postgres interval text such as "1 day" or "30 days"; checked here so a typo fails at start, not in a policy. */
function interval(name: string, fallback: string): string {
  const value = (process.env[name] ?? fallback).trim();
  if (value && !/^\d+ (minute|hour|day|week|month|year)s?$/.test(value)) throw new Error(`${name} must look like "7 days", got "${value}"`);
  return value;
}

const defaultCa = fileURLToPath(new URL("../certs/tiger-ca.pem", import.meta.url));

export const config = {
  mqttUrl: process.env.MQTT_URL || "mqtt://127.0.0.1:1883",
  mqttUsername: process.env.MQTT_USERNAME || undefined,
  mqttPassword: process.env.MQTT_PASSWORD || undefined,
  /**
   * Fixed client id + persistent session: while the service is down the broker keeps its messages,
   * and a new instance with the same id takes the session over. Use one id per environment.
   */
  mqttClientId: process.env.MQTT_CLIENT_ID || "pdm-ingest",
  mqttTopic: process.env.MQTT_TOPIC || "pdm/v1/#",
  databaseUrl: required("DATABASE_URL"),
  /** CA that signs the database certificate; "system" uses Node's public CA store instead. */
  dbCaFile: process.env.DB_CA_FILE === "system" ? undefined : process.env.DB_CA_FILE || (existsSync(defaultCa) ? defaultCa : undefined),
  compressAfter: interval("COMPRESS_AFTER", "7 days"),
  retention: interval("RETENTION", ""),
  port: Number(process.env.PORT || 8090),
  /**
   * Firebase project for the live view (Firestore); empty turns it off. Credentials come from
   * Application Default Credentials: gcloud locally, the service's own account on Cloud Run.
   */
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "",
  /**
   * Alarm emails (notify.ts): queue emails in Firestore "mail" for the plants that have them on. Only
   * one environment should send: leave it off on development machines that use the real Firestore.
   */
  notifyEmail: process.env.NOTIFY_EMAIL === "on",
  /** Address of the web app, for the link in alarm emails (e.g. https://<backend>.hosted.app). */
  notifySiteUrl: process.env.NOTIFY_SITE_URL || "",
};
