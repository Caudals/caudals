/**
 * The five-field pilot form (launch L-30) still writes the contact, the buyer
 * opportunity, the evaluation request and both audit transitions on the real
 * schema (migrations 001–030): the unasked required columns are stored as
 * "other", and the request records which form sent it.
 */
import { Pool } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { withOperatorDbSession } from "@/lib/db/client";
import { generatePrefixedUlid } from "@/lib/db/ids";
import { routePublicEvaluationRequestIntake } from "@/lib/public/evaluation-request-intake";
import { CONTACT_FORM_VERSION, evaluationRequestFormSchema } from "@/lib/validators/evaluation-request";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const ownerUrl = process.env.EVALS_TEST_OWNER_URL;

describe.skipIf(!ownerUrl)("public evaluation request intake on PostgreSQL (launch L-30)", () => {
  const pool = new Pool({ connectionString: ownerUrl, max: 1 });
  afterAll(() => pool.end());

  it("records a five-field pilot request and its related rows", async () => {
    const orgId = generatePrefixedUlid("or");
    await pool.query("INSERT INTO organization(id, kind, legal_name, display_name) VALUES($1, 'internal', 'Intake fixture', 'Intake fixture')", [orgId]);
    const data = evaluationRequestFormSchema.parse({
      fullName: "Lucía Martín",
      workEmail: "Lucia@Mutua.example",
      organization: "Mutua Ejemplo",
      sector: "insurance",
      systemAnswers: "The chat on mutua.example/ayuda, on coverage and claims for home policies.",
      requestedOffer: "pilot-evaluation",
      formVersion: CONTACT_FORM_VERSION,
      locale: "es",
    });

    const result = await routePublicEvaluationRequestIntake(data, { referer: "https://caudals.com/es/contacto?offer=pilot-evaluation" }, {
      env: { NODE_ENV: "test", PUBLIC_BUYER_BRIEF_TENANT_ORG_ID: orgId },
      runInSession: (session, callback) => withOperatorDbSession(session, callback, pool),
    });
    expect(result.status).toBe("routed");
    if (result.status !== "routed") return;

    const contact = (await pool.query("SELECT org_id, full_name, email FROM contact WHERE id=$1", [result.contactId])).rows[0];
    expect(contact).toEqual({ org_id: orgId, full_name: "Lucía Martín", email: "lucia@mutua.example" });
    const opportunity = (await pool.query("SELECT contact_id, title, state, use_case FROM buyer_opportunity WHERE id=$1", [result.buyerOpportunityId])).rows[0];
    expect(opportunity).toMatchObject({ contact_id: result.contactId, title: "Evaluation request from Mutua Ejemplo", state: "new" });
    expect(opportunity.use_case).not.toContain("System:");
    const request = (await pool.query(
      "SELECT buyer_opportunity_id, contact_id, organization_name, system_type, sector, owner_role, system_answers, requested_offer, notes, state, source FROM evaluation_request WHERE id=$1",
      [result.evaluationRequestId],
    )).rows[0];
    expect(request).toMatchObject({
      buyer_opportunity_id: result.buyerOpportunityId,
      contact_id: result.contactId,
      organization_name: "Mutua Ejemplo",
      system_type: "other",
      sector: "insurance",
      owner_role: "other",
      requested_offer: "pilot-evaluation",
      notes: null,
      state: "new",
      source: { channel: "public_contact", form: "pilot-request-v2" },
    });
    const audits = (await pool.query("SELECT target_type, metadata FROM audit_event WHERE target_id = ANY($1) ORDER BY target_type", [[result.buyerOpportunityId, result.evaluationRequestId]])).rows;
    expect(audits.map((row) => row.target_type)).toEqual(["buyer_opportunity", "evaluation_request"]);
    expect(audits[1].metadata.evaluation_request).toMatchObject({ form: "pilot-request-v2", system_type: null, owner_role: null, requested_offer: "pilot-evaluation" });
  });
});
