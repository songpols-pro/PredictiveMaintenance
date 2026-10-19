import "server-only";
import { getApps, initializeApp, type App } from "firebase-admin/app";

/**
 * Firebase Admin app for the /hvac API. On App Hosting initializeApp() reads FIREBASE_CONFIG and the
 * backend's service account; locally it uses Application Default Credentials (gcloud) and the public
 * project id. Shared with lib/firebase-admin.ts (demo requests): whichever runs first creates it.
 */
export function adminApp(): App {
  return getApps()[0] ?? (process.env.FIREBASE_CONFIG ? initializeApp() : initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID }));
}
