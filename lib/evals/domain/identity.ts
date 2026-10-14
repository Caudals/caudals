import "server-only";
import { headers } from "next/headers";
import { getBetterAuth } from "@/lib/auth/better-auth";
import { withTenant } from "@/lib/evals/repositories/db";
import { EvalError } from "./errors";
import { isEvaluationHost } from "./routing";
import { partnerScopes, type PartnerScope } from "../partners/scope";
export type EvalIdentity = {
  user: { id: string; email: string; name: string };
  platformRole: "platform_admin" | "operator" | null;
  workspaces: { id: string; name: string; role: "owner" | "editor" | "viewer" | "operator" }[];
  /** When the current sign-in happened; sensitive platform changes require a recent one. */
  sessionCreatedAt?: string;
  /**
   * Two-factor state (launch L-08, spec P-43). `required` is true for platform
   * staff (platform admins, platform operators and workspace operators) while
   * EVALS_ADMIN_MFA_REQUIRED=true; customers may turn it on but never must.
   */
  mfa?: { enabled: boolean; required: boolean };
  /**
   * Partner scope (launch L-28): the partner accounts the person belongs to
   * while PARTNERS_ENABLED opens them. Display only: partner routes re-check
   * membership in the database, and client workspaces appear in `workspaces`
   * through ordinary (partner-marked) memberships with customer roles.
   */
  partners?: PartnerScope[];
};
/** TOTP enforcement for platform staff; off until everyone has enrolled (PROGRESS.md I-6). */
export function adminMfaRequired() {
  return process.env.EVALS_ADMIN_MFA_REQUIRED === "true";
}
/** Platform admins and operators, and anyone holding a workspace operator membership. */
export function isPlatformStaff(identity: Pick<EvalIdentity, "platformRole" | "workspaces">) {
  return identity.platformRole !== null || identity.workspaces.some((workspace) => workspace.role === "operator");
}
/**
 * Staff without TOTP may only reach the enrolment page while enforcement is on.
 * Pages redirect there (components/evals/page-identity.ts); APIs answer 403
 * MFA_ENROLMENT_REQUIRED.
 */
export function assertMfaSatisfied(identity: EvalIdentity) {
  if (identity.mfa?.required && !identity.mfa.enabled) {
    throw new EvalError("MFA_ENROLMENT_REQUIRED", 403, "Turn on two-factor authentication to continue.");
  }
}
/**
 * Sensitive actions (billing, credentials, deletion) need a sign-in from the
 * last `maxMinutes`. 403, not 401: the session is valid; the person only needs
 * to confirm it is them (components/evals/reauth.tsx), then retry.
 */
export function requireRecentSignIn(identity: EvalIdentity, maxMinutes = 15) {
  const at = identity.sessionCreatedAt ? Date.parse(identity.sessionCreatedAt) : NaN;
  if (!Number.isFinite(at) || Date.now() - at > maxMinutes * 60_000) {
    throw new EvalError("REAUTHENTICATION_REQUIRED", 403, "Confirm it is you to continue.");
  }
}
export async function requireIdentity(headerStore?: Headers, options: { allowMfaEnrolment?: boolean } = {}): Promise<EvalIdentity> {
  const h = headerStore ?? await headers();
  if (!isEvaluationHost(h.get("host"))) throw new EvalError("SCOPE_DENIED",404);
  const session = await getBetterAuth().api.getSession({ headers:h, query:{disableCookieCache:true} });
  if (!session?.user || !session.user.emailVerified) throw new EvalError("SESSION_REQUIRED",401,"Sign in to continue.");
  const identity = await withTenant({orgId:"",actorId:session.user.id}, async client => {
    const roles = await client.query<{role: EvalIdentity["platformRole"]}>("SELECT role FROM evals.platform_role WHERE user_id=$1",[session.user.id]);
    const workspaces = await client.query<EvalIdentity["workspaces"][number]>(`SELECT w.id,w.name,COALESCE(m.role,'operator') AS role FROM evals.workspace w LEFT JOIN evals.membership m ON m.org_id=w.id AND m.user_id=$1 WHERE w.deleted_at IS NULL ORDER BY w.created_at DESC,w.id LIMIT 100`,[session.user.id]);
    const signedInAt=session.session?.createdAt?new Date(session.session.createdAt).toISOString():undefined;
    const partners=await partnerScopes(client,session.user.id);
    return {user:{id:session.user.id,email:session.user.email,name:session.user.name},platformRole:roles.rows[0]?.role??null,workspaces:workspaces.rows,sessionCreatedAt:signedInAt,...(partners.length?{partners}:{})} as EvalIdentity;
  });
  const enabled = (session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled === true;
  identity.mfa = { enabled, required: adminMfaRequired() && isPlatformStaff(identity) };
  if (!options.allowMfaEnrolment) assertMfaSatisfied(identity);
  return identity;
}
export async function requireWorkspace(identity: EvalIdentity, orgId: string, action: "read"|"write"|"manage" = "read") {
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new EvalError("SCOPE_DENIED",404);
  await withTenant({orgId,actorId:identity.user.id},async client=>{
    const {rows}=await client.query<{role:string}>(`SELECT m.role FROM evals.workspace w LEFT JOIN evals.membership m ON m.org_id=w.id AND m.user_id=$2 WHERE w.id=$1 AND w.deleted_at IS NULL`,[orgId,identity.user.id]);
    if (!rows.length) throw new EvalError("SCOPE_DENIED",404);
    const admin=identity.platformRole==='platform_admin';
    if (!admin && (action==='manage' ? !['owner','operator'].includes(rows[0].role) : action==='write' ? !['owner','editor','operator'].includes(rows[0].role) : !rows[0].role)) throw new EvalError("SCOPE_DENIED",404);
    if(admin) await client.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id) VALUES($1,$2,$3,$4)",[orgId,identity.user.id,`support.${action}`,orgId]);
  });
}
