"use client";

// Firebase in the browser (Auth and Firestore) for the signed-in parts of the site.
// The config is public by design (it identifies the project; access is decided by sign-in and
// firestore.rules). It is inlined at build time from NEXT_PUBLIC_FIREBASE_* (apphosting.yaml, .env.local).

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

function app(): FirebaseApp {
  if (!firebaseConfigured) throw new Error("Firebase web config is missing (NEXT_PUBLIC_FIREBASE_*)");
  return getApps()[0] ?? initializeApp(config);
}

// Local tests against the Firebase emulators of firebase.json (Auth and Firestore) with a demo project
// id: NEXT_PUBLIC_FIREBASE_EMULATORS=1, see DEPLOY.md. Never set for a deployed site.
const emulators = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";
let auth: Auth | null = null;
let db: Firestore | null = null;

export function clientAuth(): Auth {
  if (!auth) {
    auth = getAuth(app());
    if (emulators) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return auth;
}

export function clientDb(): Firestore {
  if (!db) {
    db = getFirestore(app());
    if (emulators) connectFirestoreEmulator(db, "127.0.0.1", 8085);
  }
  return db;
}
