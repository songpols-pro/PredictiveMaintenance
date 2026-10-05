import "server-only";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Firebase Admin SDK, server side only.
// On Firebase App Hosting (Cloud Run) initializeApp() needs no arguments: it reads FIREBASE_CONFIG
// and signs in with the backend's service account. Locally, point it at the Firestore emulator
// with FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT, or at a real project with
// GOOGLE_APPLICATION_CREDENTIALS (see .env.example).

function isConfigured() {
  const env = process.env;
  return Boolean(env.FIREBASE_CONFIG || env.FIRESTORE_EMULATOR_HOST || env.GOOGLE_APPLICATION_CREDENTIALS || env.K_SERVICE);
}

/** Firestore, or null when this environment has no Firebase project to write to. */
export function getDb(): Firestore | null {
  if (!isConfigured()) return null;
  const app = getApps()[0] ?? initializeApp();
  return getFirestore(app);
}
