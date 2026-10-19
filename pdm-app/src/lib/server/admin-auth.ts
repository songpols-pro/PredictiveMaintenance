import "server-only";
import { getAuth } from "firebase-admin/auth";
import type { Actor } from "@/lib/access/admin";
import { adminApp } from "./admin";
import { verifySignIn } from "./hvac-auth";

/**
 * The signed-in service operator behind an /api/hvac/admin request, or a Response to return as is
 * (401 no, bad, revoked or disabled sign-in; 403 not an operator; 503 the check failed).
 *
 * Stricter than authorize() for the plant data: the operator claim is read from the account as it is
 * now rather than from the token, so an operator whose access was taken away cannot keep using a token
 * issued before (it stays valid for up to an hour).
 */
export async function authorizeOperator(request: Request): Promise<Actor | Response> {
  const claims = await verifySignIn(request);
  if (claims instanceof Response) return claims;
  const user = await getAuth(adminApp())
    .getUser(claims.uid)
    .catch(() => null);
  if (!user || user.disabled) return Response.json({ error: "invalid, expired or revoked sign-in" }, { status: 401 });
  if (user.customClaims?.admin !== true) return Response.json({ error: "operators only" }, { status: 403 });
  return { uid: user.uid, email: user.email ?? user.uid, via: "web" };
}
