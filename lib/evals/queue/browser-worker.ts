import { createHash, randomUUID } from "node:crypto";
import type { Browser } from "playwright";
import type { PoolClient } from "pg";
import { targetConfigSchema, type InvocationContext, type TargetConfig } from "../contracts/connectors";
import { assertWebsiteRecipeOrigin, capabilityReportForWebsite, websiteRecipeSchema, type WebsiteRecipe, type BrowserProbeEvidence, type BrowserStorageState, probeEvidenceReady } from "../contracts/browser";
import { autoDetectWebsiteRecipe } from "../connectors/browser-autodetect";
import { browserStorageStateSchema } from "../contracts/browser";
import type { CandidateInput } from "../contracts/projections";
import type { Observation } from "../contracts/results";
import { canonicalJson, sha256, withContentHash } from "../contracts/hashing";
import {
  discoverWebsite,
  openWebsiteAttemptSession,
  knownRecipeProposal,
  publicDestinationCheck,
  validateWebsiteRecipe,
} from "../connectors/browser-executor";
import { jobSchema, type JobData } from "./boss";
import {
  browserDiscoverySchema,
  digest,
  event,
  projectWorkflow,
  targetExecutionSchema,
  type Tenant,
  type TenantTransaction,
} from "./store";
import { TargetExecutionWorker } from "./target-worker";
import type { Keyring } from "../security/envelope";
import { browserInvocationSession, browserConnectionSession } from "../security/secrets";

type Step = {
  id: string;
  workflow_id: string;
  input: unknown;
  input_hash: string;
  status: string;
  fence: string;
  lease_until: Date | null;
};

async function locked(client: PoolClient, orgId: string, stepId: string) {
  const step = (
    await client.query(
      "SELECT * FROM evals.workflow_step WHERE org_id=$1 AND id=$2 FOR UPDATE",
      [orgId, stepId],
    )
  ).rows[0] as Step | undefined;
  if (!step) throw new Error("step_missing");
  const workflow = (
    await client.query(
      "SELECT * FROM evals.execution_workflow WHERE org_id=$1 AND id=$2 FOR UPDATE",
      [orgId, step.workflow_id],
    )
  ).rows[0];
  return { step, workflow };
}

/**
 * Loading the page and opening the chat take part of a test's time. A reply
 * always gets at least this long once the chat is open (follow-up turns of a
 * conversation slightly less), so a slow assistant is not cut off by a slow page.
 */
const WEBSITE_REPLY_MS = 90_000, WEBSITE_TURN_MS = 60_000;
/** An error code safe to log: our own snake_case codes, or the error class. Never page text. */
const diagnosticCode = (error: unknown) => error instanceof Error ? (/^[a-z][a-z0-9_]{2,60}$/.test(error.message) ? error.message : error.name) : "unknown";
const replyDeadline = (context: InvocationContext, floorMs: number): InvocationContext =>
  ({ ...context, deadline: new Date(Math.max(Date.parse(context.deadline), Date.now() + floorMs)).toISOString() });

export class BrowserJobWorker {
  private readonly targetWorker: TargetExecutionWorker;
  private readonly destinationCheck: ReturnType<typeof publicDestinationCheck>;
  private readonly sessions = new Map<string, Awaited<ReturnType<typeof openWebsiteAttemptSession>>>();

  constructor(
    private readonly options: {
      tx: TenantTransaction;
      keys: Keyring;
      actorId: string;
      workerId: string;
      browser: Browser;
      leaseSeconds?: number;
      destinationCheck?: (url: string) => Promise<void>;
    },
  ) {
    this.destinationCheck = options.destinationCheck ?? publicDestinationCheck();
    this.targetWorker = new TargetExecutionWorker({
      tx: options.tx,
      keys: options.keys,
      actorId: options.actorId,
      workerId: options.workerId,
      leaseSeconds: options.leaseSeconds,
      execute: (config, input, context) =>
        this.executeWebsite(config, input, context),
      onAttemptFinished: async (attemptId) => {
        const session = this.sessions.get(attemptId);
        this.sessions.delete(attemptId);
        if (session) await session.close().catch(() => console.warn("browser_attempt_context_close_failed"));
      },
    });
  }

  private async executeWebsite(config: TargetConfig, input: CandidateInput, context: InvocationContext): Promise<Observation> {
    try { return await this.performWebsite(config, input, context); }
    catch (error) {
      // Expired logins and changed UIs pause the run for repair instead of
      // grading partial answers.
      if (error instanceof Error && error.message === "login_required") throw new Error("browser_session_unavailable");
      if (error instanceof Error && (error.name === "TimeoutError" || error.message.includes("strict mode violation") ||
        ["selector_unavailable", "launcher_unavailable", "selector_ambiguous", "website_frame_unavailable"].includes(error.message))) throw new Error("website_selector_failed");
      throw error;
    }
  }

  private async performWebsite(
    config: TargetConfig,
    input: CandidateInput,
    context: InvocationContext,
  ): Promise<Observation> {
    if (config.kind !== "website" || !config.recipe_revision_id) {
      throw new Error("connection_unsupported");
    }
    const existing = this.sessions.get(context.attempt_id);
    if (existing) return existing.invoke(input, replyDeadline(context, WEBSITE_TURN_MS));
    const recipe = await this.options.tx(
      { orgId: context.tenant_scope_handle, actorId: this.options.actorId },
      async (client) => {
        const row = (
          await client.query(
            `SELECT document FROM evals.website_recipe_revision
             WHERE org_id=$1 AND id=$2`,
            [context.tenant_scope_handle, config.recipe_revision_id],
          )
        ).rows[0];
        if (!row) throw new Error("connection_unsupported");
        return websiteRecipeSchema.parse(row.document);
      },
    );
    assertWebsiteRecipeOrigin(recipe.start_url, config.endpoint);
    let sessionBytes: Buffer | undefined;
    try {
      const storageState = config.login_session_id
        ? await this.options.tx(
            { orgId: context.tenant_scope_handle, actorId: this.options.actorId },
            async (client) => {
              sessionBytes = await browserInvocationSession(
                client,
                context.tenant_scope_handle,
                context.attempt_id,
                config.login_session_id!,
                this.options.keys,
              );
              return browserStorageStateSchema.parse(JSON.parse(sessionBytes.toString("utf8")));
            },
          )
        : undefined;
      const session = await openWebsiteAttemptSession({
        browser: this.options.browser,
        recipe,
        destinationCheck: this.destinationCheck,
        storageState,
      });
      this.sessions.set(context.attempt_id, session);
      return await session.invoke(input, replyDeadline(context, WEBSITE_REPLY_MS));
    } finally {
      sessionBytes?.fill(0);
    }
  }

  async canHandle(raw: JobData) {
    const job = jobSchema.parse(raw);
    return this.options.tx(
      { orgId: job.orgId, actorId: this.options.actorId },
      async (client) => {
        const row = (
          await client.query(
            "SELECT input FROM evals.workflow_step WHERE org_id=$1 AND id=$2",
            [job.orgId, job.stepId],
          )
        ).rows[0];
        return !!row &&
          (browserDiscoverySchema.safeParse(row.input).success ||
            targetExecutionSchema.safeParse(row.input).success);
      },
    );
  }

  async handle(raw: JobData) {
    const job = jobSchema.parse(raw);
    const tenant = { orgId: job.orgId, actorId: this.options.actorId };
    const kind = await this.options.tx(tenant, async (client) => {
      const row = (
        await client.query(
          "SELECT input FROM evals.workflow_step WHERE org_id=$1 AND id=$2",
          [tenant.orgId, job.stepId],
        )
      ).rows[0];
      if (!row) throw new Error("step_missing");
      return browserDiscoverySchema.safeParse(row.input).success ? "discovery" : "target";
    });
    if (kind === "target") return this.targetWorker.handle(job);
    return this.handleDiscovery(job, tenant);
  }

  private async handleDiscovery(job: JobData, tenant: Tenant) {
    const lease = this.options.leaseSeconds ?? 150;
    const claimed = await this.options.tx(tenant, async (client) => {
      const current = await locked(client, tenant.orgId, job.stepId);
      if (
        current.step.input_hash !== job.inputHash ||
        digest(current.step.input) !== current.step.input_hash
      ) {
        throw new Error("input_hash_mismatch");
      }
      if (current.step.status !== "queued") return null;
      const input = browserDiscoverySchema.parse(current.step.input);
      const target = (
        await client.query(
          `SELECT tr.document,t.id AS target_id,t.project_id
           FROM evals.target_revision tr
           JOIN evals.target t ON (t.org_id,t.id)=(tr.org_id,tr.target_id)
           WHERE tr.org_id=$1 AND tr.id=$2`,
          [tenant.orgId, input.targetRevisionId],
        )
      ).rows[0];
      if (!target) throw new Error("target_revision_missing");
      const candidate = (
        await client.query(
          `SELECT * FROM evals.website_recipe_candidate
           WHERE org_id=$1 AND id=$2 FOR UPDATE`,
          [tenant.orgId, input.candidateId],
        )
      ).rows[0];
      if (!candidate) throw new Error("recipe_candidate_missing");
      const step = (
        await client.query(
          `UPDATE evals.workflow_step SET
             status='running',fence=fence+1,lease_owner=$3,
             lease_until=now()+$4::int*interval '1 second',updated_at=now()
           WHERE org_id=$1 AND id=$2 RETURNING *`,
          [tenant.orgId, job.stepId, this.options.workerId, lease],
        )
      ).rows[0] as Step;
      await client.query(
        "UPDATE evals.website_recipe_candidate SET status='discovering',updated_at=now() WHERE org_id=$1 AND id=$2",
        [tenant.orgId, candidate.id],
      );
      await client.query(
        "UPDATE evals.connection_check SET status='running' WHERE org_id=$1 AND id=$2",
        [tenant.orgId, input.connectionCheckId],
      );
      await event(client, tenant.orgId, current.step.workflow_id, "website_discovery_started");
      return {
        step,
        workflow: current.workflow,
        input,
        target,
        candidate,
        config: targetConfigSchema.parse(target.document),
      };
    });
    if (!claimed) return;

    // Detection plus three probe sessions can outlast one lease; renew it
    // while this fenced claim is still the running one.
    const renew = setInterval(() => {
      void this.options.tx(tenant, client => client.query(
        `UPDATE evals.workflow_step SET lease_until=now()+$4::int*interval '1 second',updated_at=now()
         WHERE org_id=$1 AND id=$2 AND fence=$3 AND status='running'`,
        [tenant.orgId, claimed.step.id, claimed.step.fence, lease],
      )).catch(() => {});
    }, Math.max(5_000, (lease * 1000) / 3));
    const startedAt = Date.now();
    let stage = "load_state";
    try {
      if (claimed.config.kind !== "website") throw new Error("connection_unsupported");
      let snapshot = claimed.candidate.discovery_snapshot;
      let recipe: WebsiteRecipe | null = claimed.candidate.document
        ? websiteRecipeSchema.parse(claimed.candidate.document)
        : null;
      let screenshot: Buffer | null = null;
      let storageState: BrowserStorageState | undefined;
      {
        let stateBytes: Buffer | undefined;
        try {
          stateBytes = await this.options.tx(tenant, client => browserConnectionSession(client, tenant.orgId, claimed.input.targetRevisionId, this.options.keys));
          storageState = stateBytes ? browserStorageStateSchema.parse(JSON.parse(stateBytes.toString("utf8"))) : undefined;
        } finally { stateBytes?.fill(0); }
      }
      if (!recipe) {
        // Most chatbots are found without a person: detect the controls,
        // send one probe and learn the reply. Otherwise ask for Teach Mode.
        stage = "detect";
        try {
          recipe = websiteRecipeSchema.parse(withContentHash(await autoDetectWebsiteRecipe({
            browser: this.options.browser, url: claimed.config.endpoint, destinationCheck: this.destinationCheck,
            storageState, recipeRevisionId: randomUUID(), signal: AbortSignal.timeout(150_000),
          })));
        } catch (error) {
          console.warn(JSON.stringify({ event: "website_detection_failed", stepId: claimed.step.id, code: diagnosticCode(error), ms: Date.now() - startedAt }));
          recipe = null;
        }
      }
      if (!recipe) {
        snapshot = await discoverWebsite({
          browser: this.options.browser,
          url: claimed.config.endpoint,
          destinationCheck: this.destinationCheck,
          timeoutMs: claimed.input.timeoutMs,
          onScreenshot: (bytes) => { screenshot = bytes; },
        });
        const proposal = knownRecipeProposal(snapshot);
        if (proposal) recipe = websiteRecipeSchema.parse(withContentHash(proposal));
      }
      if (!recipe || snapshot?.has_captcha) {
        const capture = screenshot as Buffer | null;
        await this.options.tx(tenant, async (client) => {
          if (capture) {
            // Seven-day, viewport-only evidence for the operator; never scored.
            await client.query(
              `INSERT INTO evals.browser_capture(org_id,target_revision_id,candidate_id,reason_code,media_type,bytes,sha256)
               VALUES($1,$2,$3,$4,'image/jpeg',$5,$6)`,
              [tenant.orgId, claimed.input.targetRevisionId, claimed.candidate.id,
                snapshot?.has_captcha ? "captcha_present" : "recipe_not_found", capture,
                createHash("sha256").update(capture).digest("hex")],
            );
          }
          await client.query(
            `UPDATE evals.website_recipe_candidate SET
               discovery_snapshot=$3,status='needs_operator',reason_code=$4,updated_at=now()
             WHERE org_id=$1 AND id=$2`,
            [
              tenant.orgId,
              claimed.candidate.id,
              snapshot ?? null,
              snapshot?.has_captcha ? "captcha_present" : "recipe_not_found",
            ],
          );
          await client.query(
            `UPDATE evals.connection_check SET
               status='needs_operator',error_code=$3,
               probe_evidence=jsonb_build_object('kind','website_discovery','candidate_id',$4::text),
               completed_at=now()
             WHERE org_id=$1 AND id=$2`,
            [
              tenant.orgId,
              claimed.input.connectionCheckId,
              snapshot?.has_captcha ? "captcha_present" : "recipe_not_found",
              claimed.candidate.id,
            ],
          );
          await client.query(
            "UPDATE evals.workflow_step SET status='completed',lease_until=NULL,reason_code='needs_operator',updated_at=now() WHERE org_id=$1 AND id=$2",
            [tenant.orgId, claimed.step.id],
          );
          await event(
            client,
            tenant.orgId,
            claimed.step.workflow_id,
            "website_needs_operator",
          );
          await projectWorkflow(client, tenant.orgId, claimed.step.workflow_id);
        });
        return;
      }

      assertWebsiteRecipeOrigin(recipe.start_url, claimed.config.endpoint);
      if (recipe.completion.kind === "text_stable") {
        await this.options.tx(tenant, async (client) => {
          const current = await locked(client, tenant.orgId, claimed.step.id);
          if (current.step.status !== "running" || current.step.fence !== claimed.step.fence) return;
          await client.query(
            `UPDATE evals.website_recipe_candidate SET
               document=$3,discovery_snapshot=$4,status='needs_operator',
               reason_code='website_completion_unverified',updated_at=now()
             WHERE org_id=$1 AND id=$2`,
            [tenant.orgId, claimed.candidate.id, recipe, snapshot ?? null],
          );
          await client.query(
            `UPDATE evals.connection_check SET status='needs_operator',
               error_code='website_completion_unverified',completed_at=now()
             WHERE org_id=$1 AND id=$2`,
            [tenant.orgId, claimed.input.connectionCheckId],
          );
          await client.query(
            `UPDATE evals.workflow_step SET status='completed',lease_until=NULL,
               reason_code='needs_operator',updated_at=now() WHERE org_id=$1 AND id=$2`,
            [tenant.orgId, claimed.step.id],
          );
          await event(client, tenant.orgId, claimed.step.workflow_id, "website_needs_operator", "website_completion_unverified");
          await projectWorkflow(client, tenant.orgId, claimed.step.workflow_id);
        });
        return;
      }

      stage = "test";
      const evidence: BrowserProbeEvidence = await validateWebsiteRecipe({
        browser: this.options.browser,
        recipe,
        destinationCheck: this.destinationCheck,
        timeoutMs: claimed.input.timeoutMs,
        storageState,
        onProbeFailed: (failure) => console.warn(JSON.stringify({ event: "website_probe_failed", stepId: claimed.step.id, ...failure })),
      });
      if (!probeEvidenceReady(evidence)) {
        throw new Error("recipe_probe_failed");
      }
      const nextTargetRevisionId = randomUUID();
      await this.options.tx(tenant, async (client) => {
        const current = await locked(client, tenant.orgId, claimed.step.id);
        if (
          current.step.status !== "running" ||
          current.step.fence !== claimed.step.fence
        ) {
          return;
        }
        // The system may have changed while this check ran: a login saved or a
        // connection made in the live browser. Build on its latest revision,
        // and never replace a connection someone made in the meantime.
        const latest = targetConfigSchema.parse((await client.query(
          "SELECT document FROM evals.target_revision WHERE org_id=$1 AND target_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",
          [tenant.orgId, claimed.target.target_id],
        )).rows[0].document);
        const superseded = latest.kind === "website" && !!latest.recipe_revision_id && latest.recipe_revision_id !== (claimed.config.kind === "website" ? claimed.config.recipe_revision_id : undefined);
        const nextConfig = targetConfigSchema.parse({
          ...latest,
          target_revision_id: nextTargetRevisionId,
          recipe_revision_id: recipe.recipe_revision_id,
        });
        if (superseded) {
          await client.query("UPDATE evals.website_recipe_candidate SET status='validated',reason_code='superseded',updated_at=now() WHERE org_id=$1 AND id=$2", [tenant.orgId, claimed.candidate.id]);
          await client.query("UPDATE evals.connection_check SET status='ready',capability_report=$3,error_code=NULL,probe_evidence=$4,completed_at=now() WHERE org_id=$1 AND id=$2",
            [tenant.orgId, claimed.input.connectionCheckId, capabilityReportForWebsite(recipe, evidence), evidence]);
          await client.query("UPDATE evals.workflow_step SET status='completed',lease_until=NULL,reason_code='superseded',updated_at=now() WHERE org_id=$1 AND id=$2", [tenant.orgId, claimed.step.id]);
          await event(client, tenant.orgId, claimed.step.workflow_id, "website_recipe_validated", "superseded");
          await projectWorkflow(client, tenant.orgId, claimed.step.workflow_id);
          return;
        }
        await client.query(
          `INSERT INTO evals.website_recipe_revision(
             id,org_id,project_id,target_id,content_hash,document,probe_evidence
           ) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            recipe.recipe_revision_id,
            tenant.orgId,
            claimed.target.project_id,
            claimed.target.target_id,
            recipe.content_hash,
            recipe,
            evidence,
          ],
        );
        await client.query(
          `INSERT INTO evals.target_revision(id,org_id,target_id,content_hash,document)
           VALUES($1,$2,$3,$4,$5)`,
          [
            nextTargetRevisionId,
            tenant.orgId,
            claimed.target.target_id,
            sha256(canonicalJson(nextConfig)),
            nextConfig,
          ],
        );
        await client.query(
          `UPDATE evals.website_recipe_candidate SET
             document=$3,discovery_snapshot=$4,status='validated',reason_code=NULL,updated_at=now()
           WHERE org_id=$1 AND id=$2`,
          [tenant.orgId, claimed.candidate.id, recipe, snapshot ?? null],
        );
        await client.query(
          `UPDATE evals.connection_check SET
             status='ready',capability_report=$3,error_code=NULL,
             probe_evidence=$4,completed_at=now()
           WHERE org_id=$1 AND id=$2`,
          [
            tenant.orgId,
            claimed.input.connectionCheckId,
            capabilityReportForWebsite(recipe, evidence),
            { ...evidence, next_target_revision_id: nextTargetRevisionId },
          ],
        );
        await client.query(
          "UPDATE evals.workflow_step SET status='completed',lease_until=NULL,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2",
          [tenant.orgId, claimed.step.id],
        );
        await event(
          client,
          tenant.orgId,
          claimed.step.workflow_id,
          "website_recipe_validated",
        );
        await projectWorkflow(client, tenant.orgId, claimed.step.workflow_id);
      });
    } catch (error) {
      const reason =
        error instanceof Error &&
        [
          "capture_incomplete",
          "recipe_probe_failed",
          "website_frame_unavailable",
          "connection_unsupported",
          "destination_denied",
          "destination_invalid",
          "website_recipe_origin_mismatch",
          "website_completion_unverified",
          "browser_session_unavailable",
        ].includes(error.message)
          ? error.message
          : "website_discovery_failed";
      console.warn(JSON.stringify({ event: "website_discovery_failed", stepId: claimed.step.id, stage, reason, code: diagnosticCode(error), ms: Date.now() - startedAt }));
      await this.options.tx(tenant, async (client) => {
        const current = await locked(client, tenant.orgId, claimed.step.id);
        if (
          current.step.status !== "running" ||
          current.step.fence !== claimed.step.fence
        ) {
          return;
        }
        await client.query(
          `UPDATE evals.website_recipe_candidate SET
             status='needs_operator',reason_code=$3,updated_at=now()
           WHERE org_id=$1 AND id=$2`,
          [tenant.orgId, claimed.candidate.id, reason],
        );
        await client.query(
          `UPDATE evals.connection_check SET
             status='needs_operator',error_code=$3,completed_at=now()
           WHERE org_id=$1 AND id=$2`,
          [tenant.orgId, claimed.input.connectionCheckId, reason],
        );
        await client.query(
          `UPDATE evals.workflow_step SET
             status='failed',lease_until=NULL,reason_code=$3,updated_at=now()
           WHERE org_id=$1 AND id=$2`,
          [tenant.orgId, claimed.step.id, reason],
        );
        await event(
          client,
          tenant.orgId,
          claimed.step.workflow_id,
          "website_discovery_failed",
          reason,
        );
        await projectWorkflow(client, tenant.orgId, claimed.step.workflow_id);
      });
    } finally {
      clearInterval(renew);
    }
  }

  async recover(tenant: Tenant) {
    const discovery = await this.options.tx(tenant, async (client) => {
      const rows = (
        await client.query(
          `SELECT s.id,s.workflow_id,s.input
           FROM evals.workflow_step s
           WHERE s.org_id=$1 AND s.step_kind='execute_browser'
             AND s.status='running' AND s.lease_until<=now()
           ORDER BY s.lease_until LIMIT 100 FOR UPDATE SKIP LOCKED`,
          [tenant.orgId],
        )
      ).rows.filter((row) => browserDiscoverySchema.safeParse(row.input).success);
      for (const row of rows) {
        const input = browserDiscoverySchema.parse(row.input);
        await client.query(
          `UPDATE evals.workflow_step SET
             status='unknown',fence=fence+1,lease_until=NULL,
             reason_code='browser_probe_outcome_unknown',updated_at=now()
           WHERE org_id=$1 AND id=$2`,
          [tenant.orgId, row.id],
        );
        await client.query(
          `UPDATE evals.website_recipe_candidate SET
             status='needs_operator',reason_code='browser_probe_outcome_unknown',updated_at=now()
           WHERE org_id=$1 AND id=$2`,
          [tenant.orgId, input.candidateId],
        );
        await client.query(
          `UPDATE evals.connection_check SET
             status='needs_operator',error_code='browser_probe_outcome_unknown',completed_at=now()
           WHERE org_id=$1 AND id=$2`,
          [tenant.orgId, input.connectionCheckId],
        );
        await event(
          client,
          tenant.orgId,
          row.workflow_id,
          "website_probe_unknown",
          "browser_probe_outcome_unknown",
        );
      }
      return rows.length;
    });
    return discovery + (await this.targetWorker.recover(tenant));
  }
}
