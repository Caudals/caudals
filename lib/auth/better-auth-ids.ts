import type { GenerateIdFn } from "better-auth";

import { createPrefixedId } from "@/lib/operator/ids";

const betterAuthIdPrefixes: Record<string, string> = {
  account: "aa",
  auth_account: "aa",
  auth_invitation: "ai",
  auth_member: "am",
  auth_organization: "ao",
  auth_passkey: "ak",
  auth_session: "as",
  auth_team: "at",
  auth_team_member: "ab",
  auth_two_factor: "af",
  auth_user: "au",
  auth_verification: "av",
  invitation: "ai",
  member: "am",
  organization: "ao",
  passkey: "ak",
  session: "as",
  team: "at",
  teamMember: "ab",
  twoFactor: "af",
  user: "au",
  verification: "av",
};

export const createBetterAuthId: GenerateIdFn = ({ model }) =>
  createPrefixedId(betterAuthIdPrefixes[model] ?? "ba");
