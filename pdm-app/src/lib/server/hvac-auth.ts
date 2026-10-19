import "server-only";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { SLUG } from "@/lib/telemetry/contract";
import { adminApp } from "./admin";
import { projectOrg } from "./registry";

export interface Caller {
  uid: string;
  email: string | null;
}

/** Answers of verifyIdToken that are about the sign-in itself; anything else is this server's problem. */
const SIGN_IN_PROBLEMS = new Set(["auth/argument-error", "auth/id-token-expired", "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found", "auth/invalid-id-token"]);

/**
 * The verified ID token of the request (Authorization: Bearer), or a Response to return as is: 401 no,
 * bad, expired, revoked or disabled sign-in; 503 when the check itself fails. The revocation check
 * reads the account in Firebase Auth, so the server's service account needs Firebase Auth access
 * (see DEPLOY.md); without it every request would otherwise look like a bad sign-in.
 */
export async function verifySignIn(request: Request): Promise<DecodedIdToken | Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return Response.json({ error: "sign-in required" }, { status: 401 });
  try {
    return await getAuth(adminApp()).verifyIdToken(token, true);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (SIGN_IN_PROBLEMS.has(code)) return Response.json({ error: "invalid, expired or revoked sign-in" }, { status: 401 });
    console.error(`[hvac-auth] could not check a sign-in (${code || "no code"}); does the service account have Firebase Authentication access?`, e);
    return Response.json({ error: "sign-in check unavailable" }, { status: 503 });
  }
}

/**
 * The signed-in caller, if their Firebase ID token is valid and may open the project: the same rule as
 * firestore.rules. Otherwise a Response to return as is (see verifySignIn; 403 no access to the
 * project). The revocation check (one lookup in Firebase Auth per request) makes a disabled account
 * lose these routes at once, not when its token runs out.
 */
export async function authorize(request: Request, project: string | null): Promise<Caller | Response> {
  const claims = await verifySignIn(request);
  if (claims instanceof Response) return claims;
  if (!project || !SLUG.test(project) || !(await mayOpen(claims, project))) {
    return Response.json({ error: "no access to this project" }, { status: 403 });
  }
  return { uid: claims.uid, email: claims.email ?? null };
}

const claimList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Custom claims (set with `npm run access` in services/ingest): "admin" opens every project,
 * "projects" single plants, "orgs" the customers whose projects it opens (the project document's
 * "org", read from a one-minute cache).
 */
async function mayOpen(claims: DecodedIdToken, project: string): Promise<boolean> {
  if (claims.admin === true || claimList(claims.projects).includes(project)) return true;
  const orgs = claimList(claims.orgs);
  if (!orgs.length) return false;
  const org = await projectOrg(project);
  return org !== null && orgs.includes(org);
}
