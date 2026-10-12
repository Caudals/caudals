/**
 * Admin two-factor authentication on the real auth schema (launch L-08,
 * spec P-43, migration 107): TOTP enrolment, recovery codes, account lockout,
 * EVALS_ADMIN_MFA_REQUIRED enforcement in requireIdentity, durable sign-in
 * limits and the guarded rollback. Runs against scripts/evals/test-db.sh.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
import { stageAOwnerUrl } from "../evals/stage-a-env";

const ownerUrl = stageAOwnerUrl;
const password = "Synthetic-password-123";
const host = "localhost:3000";
/** The two-factor plugin's server endpoints (the inferred type omits plugin routes). */
type Endpoint<Body, Result> = (input: { headers?: Headers; body: Body; asResponse?: boolean }) => Promise<Result>;
type TwoFactorApi = {
  enableTwoFactor: Endpoint<{ password: string }, { totpURI: string; backupCodes: string[] }>;
  verifyTOTP: Endpoint<{ code: string }, Response>;
  verifyBackupCode: Endpoint<{ code: string }, Response>;
};
const migration = (name: string) => readFileSync(path.resolve(__dirname, "../../db", name), "utf8");

describe.skipIf(!ownerUrl || !process.env.EVALS_TEST_DATABASE_URL)("admin two-factor authentication on the real auth schema", () => {
  const pool = new Pool({ connectionString: ownerUrl, max: 3 });
  let auth: ReturnType<typeof betterAuth>;
  const twoFactor = () => auth.api as unknown as TwoFactorApi;
  let identityModule: typeof import("@/lib/evals/domain/identity");
  let guard: typeof import("@/lib/auth/request-guard");

  beforeAll(async () => {
    process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123";
    process.env.DATABASE_URL = ownerUrl;
    const { createBetterAuthOptions } = await import("@/lib/auth/better-auth-options");
    auth = betterAuth(createBetterAuthOptions(pool));
    identityModule = await import("@/lib/evals/domain/identity");
    guard = await import("@/lib/auth/request-guard");
  });
  afterEach(() => { vi.unstubAllEnvs(); });
  afterAll(async () => {
    const { getPostgresPool } = await import("@/lib/db/client");
    await getPostgresPool().end().catch(() => undefined);
    await pool.end();
  });

  async function user(options: { platformRole?: "platform_admin" | "operator"; membership?: "owner" | "operator" } = {}) {
    const { createPrefixedId } = await import("@/lib/operator/ids");
    const id = createPrefixedId("au");
    const email = `${randomUUID()}@example.test`;
    await pool.query('INSERT INTO auth_user(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())', [id, "MFA fixture", email]);
    await pool.query('INSERT INTO auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,now(),now())', [createPrefixedId("aa"), id, "credential", id, await hashPassword(password)]);
    if (options.platformRole) await pool.query("INSERT INTO evals.platform_role(user_id,role) VALUES($1,$2)", [id, options.platformRole]);
    if (options.membership) {
      const orgId = randomUUID();
      await pool.query("INSERT INTO evals.workspace(id,name,created_by) VALUES($1,'MFA fixture',$2)", [orgId, id]);
      await pool.query("INSERT INTO evals.membership(org_id,user_id,role) VALUES($1,$2,$3)", [orgId, id, options.membership]);
    }
    return { id, email };
  }
  const cookieOf = (response: Response) => response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  async function signIn(email: string) {
    const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    expect(response.status).toBe(200);
    return { cookie: cookieOf(response), body: await response.json() as { twoFactorRedirect?: boolean } };
  }
  const headers = (cookie: string) => new Headers({ cookie, host });
  async function enrol(cookie: string) {
    const enabled = await twoFactor().enableTwoFactor({ headers: headers(cookie), body: { password } });
    const secret = new TextDecoder().decode(base32.decode(new URL(enabled.totpURI).searchParams.get("secret")!));
    // Turning two-factor on replaces the session; the browser receives the new cookie.
    const verified = await twoFactor().verifyTOTP({ headers: headers(cookie), body: { code: await createOTP(secret).totp() }, asResponse: true });
    expect(verified.status).toBe(200);
    return { secret, backupCodes: enabled.backupCodes, cookie: cookieOf(verified) };
  }

  it("enrols TOTP, then signs in with the app code or a single-use recovery code", async () => {
    const admin = await user({ platformRole: "platform_admin" });
    const { secret, backupCodes } = await enrol((await signIn(admin.email)).cookie);
    expect(backupCodes).toHaveLength(10);
    expect((await pool.query('SELECT "twoFactorEnabled" FROM auth_user WHERE id=$1', [admin.id])).rows[0].twoFactorEnabled).toBe(true);

    // Password alone no longer creates a session.
    const challenged = await auth.api.signInEmail({ body: { email: admin.email, password }, asResponse: true });
    expect(await challenged.json()).toMatchObject({ twoFactorRedirect: true });
    const verified = await twoFactor().verifyTOTP({ headers: headers(cookieOf(challenged)), body: { code: await createOTP(secret).totp() }, asResponse: true });
    expect(verified.status).toBe(200);

    const recovery = await auth.api.signInEmail({ body: { email: admin.email, password }, asResponse: true });
    const used = await twoFactor().verifyBackupCode({ headers: headers(cookieOf(recovery)), body: { code: backupCodes[0] }, asResponse: true });
    expect(used.status).toBe(200);
    const again = await auth.api.signInEmail({ body: { email: admin.email, password }, asResponse: true });
    const reused = await twoFactor().verifyBackupCode({ headers: headers(cookieOf(again)), body: { code: backupCodes[0] }, asResponse: true });
    expect(reused.status).toBeGreaterThanOrEqual(400);
  });

  it("locks verification after ten wrong codes, using the migration 107 columns", async () => {
    const admin = await user({ platformRole: "platform_admin" });
    await enrol((await signIn(admin.email)).cookie);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const challenge = await auth.api.signInEmail({ body: { email: admin.email, password }, asResponse: true });
      const wrong = await twoFactor().verifyTOTP({ headers: headers(cookieOf(challenge)), body: { code: "000000" }, asResponse: true });
      expect(wrong.status).toBeGreaterThanOrEqual(400);
    }
    const row = (await pool.query('SELECT "failedVerificationCount","lockedUntil" FROM auth_two_factor WHERE "userId"=$1', [admin.id])).rows[0];
    expect(row.lockedUntil).not.toBeNull();
    // The rollback refuses while any account holds lockout state.
    await expect(pool.query(migration("rollbacks/107_auth_two_factor_lockout_down.sql"))).rejects.toThrow(/rollback refused/);
    await pool.query('UPDATE auth_two_factor SET "failedVerificationCount"=0,"lockedUntil"=NULL');
    await pool.query(migration("rollbacks/107_auth_two_factor_lockout_down.sql"));
    const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='auth_two_factor' AND column_name IN ('lockedUntil','failedVerificationCount')");
    expect(columns.rowCount).toBe(0);
    // Forward again, as the migrator would.
    const forward = migration("migrations/107_auth_two_factor_lockout.sql");
    await pool.query(forward);
    await pool.query("INSERT INTO public.evals_migration_history(name,sha256) VALUES('107_auth_two_factor_lockout.sql',$1) ON CONFLICT DO NOTHING", [createHash("sha256").update(forward).digest("hex")]);
  });

  it("enforces TOTP for platform staff only while EVALS_ADMIN_MFA_REQUIRED=true", async () => {
    const admin = await user({ platformRole: "platform_admin" });
    const operator = await user({ membership: "operator" });
    const customer = await user({ membership: "owner" });
    const adminSession = (await signIn(admin.email)).cookie;
    const operatorSession = (await signIn(operator.email)).cookie;
    const customerSession = (await signIn(customer.email)).cookie;
    const { requireIdentity } = identityModule;

    vi.stubEnv("EVALS_ADMIN_MFA_REQUIRED", "false");
    expect((await requireIdentity(headers(adminSession))).mfa).toEqual({ enabled: false, required: false });

    vi.stubEnv("EVALS_ADMIN_MFA_REQUIRED", "true");
    await expect(requireIdentity(headers(adminSession))).rejects.toMatchObject({ code: "MFA_ENROLMENT_REQUIRED", status: 403 });
    await expect(requireIdentity(headers(operatorSession))).rejects.toMatchObject({ code: "MFA_ENROLMENT_REQUIRED" });
    expect((await requireIdentity(headers(customerSession))).mfa).toEqual({ enabled: false, required: false });
    // The enrolment page may still load the identity.
    expect((await requireIdentity(headers(adminSession), { allowMfaEnrolment: true })).mfa).toEqual({ enabled: false, required: true });

    // Enrolling satisfies the requirement at once, in the session it hands back.
    const enrolled = await enrol(adminSession);
    const identity = await requireIdentity(headers(enrolled.cookie));
    expect(identity.mfa).toEqual({ enabled: true, required: true });
    // The new session also counts as a recent sign-in.
    expect(() => identityModule.requireRecentSignIn(identity)).not.toThrow();
  });

  it("limits sign-in per visitor and per account in PostgreSQL", async () => {
    const request = (email: string, address: string) => new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": address },
      body: JSON.stringify({ email, password: "wrong" }),
    });
    const visitor = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    for (let attempt = 0; attempt < 20; attempt += 1) expect(await guard.authRateLimit(request(`${randomUUID()}@example.test`, visitor))).toBeNull();
    const limited = await guard.authRateLimit(request(`${randomUUID()}@example.test`, visitor));
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get("retry-after"))).toBeGreaterThan(0);

    const account = `${randomUUID()}@example.test`;
    for (let attempt = 0; attempt < 10; attempt += 1) expect(await guard.authRateLimit(request(account, `203.0.113.${attempt + 1}`))).toBeNull();
    expect((await guard.authRateLimit(request(account.toUpperCase(), "203.0.113.200")))?.status).toBe(429);
  });
});
