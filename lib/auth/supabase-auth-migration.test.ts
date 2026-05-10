import { describe, expect, it } from "vitest";

import {
  buildMigratedOperatorIdentity,
  deterministicPrefixedId,
  mapLegacySupabaseRole,
} from "@/lib/auth/supabase-auth-migration";

const legacyRow = {
  legacyUserId: "7b018d4d-8d04-46f1-9abf-ecf0542c3851",
  email: "Admin@Caudals.com",
  emailVerified: true,
  createdAt: "2026-01-10T10:00:00.000Z",
  updatedAt: "2026-01-11T10:00:00.000Z",
  profileName: "Legacy Admin",
  profileAvatarUrl: "https://example.test/avatar.png",
  profileRole: "admin",
  profileMail: null,
  rawUserMetadata: { role: "contributor", full_name: "Metadata Name" },
};

describe("Supabase auth migration mapping", () => {
  it("creates deterministic prefixed IDs that pass the Phase 1 shape", () => {
    expect(deterministicPrefixedId("au", "source")).toMatch(
      /^au_[0-9A-HJKMNP-TV-Z]{26}$/
    );
    expect(deterministicPrefixedId("au", "source")).toBe(
      deterministicPrefixedId("au", "source")
    );
    expect(deterministicPrefixedId("au", "source")).not.toBe(
      deterministicPrefixedId("au", "other")
    );
  });

  it("maps legacy admins to operator admins by default", () => {
    expect(mapLegacySupabaseRole("admin")).toBe("admin");
    expect(mapLegacySupabaseRole("contributor")).toBeNull();
    expect(mapLegacySupabaseRole("requester", true)).toBe("operations");
  });

  it("normalizes admin rows into Better Auth and operator identities", () => {
    expect(buildMigratedOperatorIdentity(legacyRow)).toMatchObject({
      legacyUserId: legacyRow.legacyUserId,
      authUserId: expect.stringMatching(/^au_/),
      authAccountId: expect.stringMatching(/^aa_/),
      authMemberId: expect.stringMatching(/^am_/),
      operatorId: expect.stringMatching(/^op_/),
      email: "admin@caudals.com",
      name: "Legacy Admin",
      image: "https://example.test/avatar.png",
      legacyRole: "admin",
      operatorRole: "admin",
      emailVerified: true,
      createdAt: "2026-01-10T10:00:00.000Z",
      updatedAt: "2026-01-11T10:00:00.000Z",
    });
  });

  it("skips non-admin rows unless explicitly included", () => {
    const contributor = { ...legacyRow, profileRole: "contributor" };

    expect(buildMigratedOperatorIdentity(contributor)).toBeNull();
    expect(buildMigratedOperatorIdentity(contributor, true)).toMatchObject({
      operatorRole: "operations",
      legacyRole: "contributor",
    });
  });
});
