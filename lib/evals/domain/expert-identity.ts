import "server-only";

import { withTenant } from "../repositories/db";
import { EvalError } from "./errors";
import type { ExpertActor } from "../experts/store";

export async function requireExpertProfile(userId: string): Promise<ExpertActor> {
  return withTenant({ orgId: "", actorId: userId }, async (db) => {
    const profile = (await db.query<{
      id: string; credentials_status: string; terms_status: string; eligibility_status: string;
    }>(
      `SELECT id,credentials_status,terms_status,eligibility_status
       FROM evals.expert_profile WHERE user_id=$1`,
      [userId],
    )).rows[0];
    if (!profile || profile.credentials_status !== "verified" || profile.terms_status !== "accepted" ||
      !["calibrating", "eligible"].includes(profile.eligibility_status)) {
      throw new EvalError("SCOPE_DENIED", 404, "Expert work is not available.");
    }
    return { userId, profileId: profile.id };
  });
}
