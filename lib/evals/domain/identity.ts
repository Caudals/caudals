import "server-only";
import { headers } from "next/headers";
import { getBetterAuth } from "@/lib/auth/better-auth";
import { withTenant } from "@/lib/evals/repositories/db";
import { EvalError } from "./errors";
import { isEvaluationHost } from "./routing";
export type EvalIdentity = {
  user: { id: string; email: string; name: string };
  platformRole: "platform_admin" | "operator" | null;
  workspaces: { id: string; name: string; role: "owner" | "editor" | "viewer" | "operator" }[];
  /** When the current sign-in happened; sensitive platform changes require a recent one. */
  sessionCreatedAt?: string;
};
export async function requireIdentity(headerStore?: Headers): Promise<EvalIdentity> {
  const h = headerStore ?? await headers();
  if (!isEvaluationHost(h.get("host"))) throw new EvalError("SCOPE_DENIED",404);
  const session = await getBetterAuth().api.getSession({ headers:h, query:{disableCookieCache:true} });
  if (!session?.user || !session.user.emailVerified) throw new EvalError("SESSION_REQUIRED",401,"Sign in to continue.");
  return withTenant({orgId:"",actorId:session.user.id}, async client => {
    const roles = await client.query<{role: EvalIdentity["platformRole"]}>("SELECT role FROM evals.platform_role WHERE user_id=$1",[session.user.id]);
    const workspaces = await client.query<EvalIdentity["workspaces"][number]>(`SELECT w.id,w.name,COALESCE(m.role,'operator') AS role FROM evals.workspace w LEFT JOIN evals.membership m ON m.org_id=w.id AND m.user_id=$1 WHERE w.deleted_at IS NULL ORDER BY w.created_at DESC,w.id LIMIT 100`,[session.user.id]);
    const signedInAt=session.session?.createdAt?new Date(session.session.createdAt).toISOString():undefined;
    return {user:{id:session.user.id,email:session.user.email,name:session.user.name},platformRole:roles.rows[0]?.role??null,workspaces:workspaces.rows,sessionCreatedAt:signedInAt};
  });
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
