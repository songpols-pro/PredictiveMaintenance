"use client";

// Signed-in user and what they may open. Accounts are created by an administrator (no public sign-up);
// access is a set of custom claims on the account, set with `npm run access` in services/ingest:
//   orgs: ["acme", ...]             the customers this user belongs to: every project of theirs
//                                   (projects/{p}.org, set with `npm run org`)
//   projects: ["hq-chiller", ...]   single plants given one by one (exceptions)
//   admin: true                     every project (operators of the service)
// firestore.rules and the /api/hvac routes check the same claims; this store only drives the screens.

import { useSyncExternalStore } from "react";
import { onIdTokenChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { clientAuth, firebaseConfigured } from "./client";

export interface Session {
  status: "loading" | "signedOut" | "signedIn" | "unconfigured";
  email: string | null;
  projects: string[];
  orgs: string[];
  admin: boolean;
}

const LOADING: Session = { status: "loading", email: null, projects: [], orgs: [], admin: false };
let session: Session = firebaseConfigured ? LOADING : { ...LOADING, status: "unconfigured" };
let started = false;
const listeners = new Set<() => void>();

const texts = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function emit() {
  for (const l of listeners) l();
}

async function load(user: User | null) {
  if (!user) {
    session = { status: "signedOut", email: null, projects: [], orgs: [], admin: false };
  } else {
    const { claims } = await user.getIdTokenResult();
    session = { status: "signedIn", email: user.email, projects: texts(claims.projects), orgs: texts(claims.orgs), admin: claims.admin === true };
  }
  emit();
}

function start() {
  if (started || !firebaseConfigured) return;
  started = true;
  onIdTokenChanged(clientAuth(), (user) => void load(user));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

export function useSession(): Session {
  return useSyncExternalStore(subscribe, () => session, () => LOADING);
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(clientAuth(), email, password);
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(clientAuth());
}

/**
 * Firebase's own password-reset email (no mail service of ours involved), in the given language
 * ("th", "en"; else the project's default). Also how an operator invites a new account to set a password.
 */
export async function resetPassword(email: string, language?: string): Promise<void> {
  const auth = clientAuth();
  auth.languageCode = language ?? null;
  await sendPasswordResetEmail(auth, email);
}

/**
 * Fetch a fresh token, so access granted a moment ago applies without signing out and in.
 * A forced refresh does not reliably notify onIdTokenChanged, so the claims are read again here.
 */
export async function refreshAccess(): Promise<void> {
  const user = clientAuth().currentUser;
  if (!user) return;
  await user.getIdToken(true);
  await load(user);
}

/** ID token for our own API routes (history), which verify it server side. */
export async function idToken(): Promise<string | null> {
  return (await clientAuth().currentUser?.getIdToken()) ?? null;
}
