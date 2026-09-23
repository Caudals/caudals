import { test, expect } from "@playwright/test";
const id = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(43);
/** Sign-out lives in the sidebar account menu; open it before reaching for it. */
async function openAccountMenu(page: import("@playwright/test").Page) {
  // Both shells render an account chip; only one is ever on screen. Target the
  // visible one, and do not re-click a menu that is already open.
  const trigger = page.locator(".p-account:visible").last();
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  await expect(
    page.getByRole("menuitem", { name: "Sign out", exact: true }),
  ).toBeVisible();
}
test("creates clients, scopes and revokes invitations with UUID idempotency keys", async ({
  page,
}) => {
  const clients: { id: string; name: string }[] = [];
  const keys: string[] = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const r = route.request();
    const path = new URL(r.url()).pathname;
    if (r.method() === "POST") {
      expect(r.headers()["idempotency-key"]).toMatch(/^[a-f0-9-]{36}$/);
      keys.push(r.headers()["idempotency-key"]);
    }
    let data: unknown = [];
    if (path.endsWith("/workspaces")) {
      if (r.method() === "POST") {
        const w = {
          id: clients.length ? "00000000-0000-4000-8000-000000000002" : id,
          name: r.postDataJSON().name,
        };
        clients.push(w);
        data = w;
      } else data = clients;
    } else if (r.method() === "POST") {
      expect(r.postDataJSON()).toEqual({
        email: "viewer@example.test",
        role: "viewer",
      });
      data = {
        id: "invite-one",
        email: "viewer@example.test",
        role: "viewer",
        token,
      };
    } else if (r.method() === "DELETE") {
      expect(new URL(r.url()).searchParams.get("orgId")).toBe(id);
      data = { revoked: true };
    }
    await route.fulfill({ json: { data, meta: {} } });
  });
  await page.goto("/ops");
  for (const name of ["Client one", "Client two"]) {
    await page.getByLabel("Client name", { exact: true }).fill(name);
    await page
      .getByRole("button", { name: "Create workspace", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "Select client: Client one", exact: true })
    .click();
  await page.getByLabel("Email address").fill("viewer@example.test");
  await page
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(page.getByLabel("Private invitation link")).toHaveValue(
    `http://127.0.0.1:4187/workspace/invitations#token=${token}`,
  );
  await page
    .getByRole("button", { name: "Revoke invitation", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Invitation revoked.");
  expect(new Set(keys).size).toBe(3);
});
test("session expiry exposes recovery and no successful mutation", async ({
  page,
}) => {
  await page.route("**/api/evals/v1/**", (r) =>
    r.fulfill({
      status: 401,
      json: { error: { code: "SESSION_REQUIRED", message: "Sign in" } },
    }),
  );
  await page.goto("/ops");
  await expect(page.getByRole("alert")).toContainText("session has expired");
  await expect(
    page.getByRole("link", { name: "Sign in again" }),
  ).toHaveAttribute("href", "/workspace/sign-in?next=%2Fevaluation-entry");
  await expect(
    page.getByRole("link", { name: "Recover account" }),
  ).toBeVisible();
});
test("unauthenticated invitation enrolls with exact contract and removes URL token", async ({
  page,
}) => {
  await page.route("**/api/evals/v1/invitations/enroll", async (r) => {
    expect(r.request().postDataJSON()).toEqual({
      token,
      name: "New member",
      password: "a-long-test-password",
    });
    await r.fulfill({ json: { data: { org_id: id }, meta: {} } });
  });
  await page.goto(`/workspace/invitations?anonymous=1#token=${token}`);
  await expect(page).toHaveURL(/\/workspace\/invitations$/);
  await page.getByLabel("Full name").fill("New member");
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account and join" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Account created. Sign in to open your workspace.",
  );
});
test("authenticated acceptance shows success only after API response", async ({
  page,
}) => {
  await page.route("**/api/evals/v1/invitations/accept", async (r) => {
    expect(r.request().postDataJSON()).toEqual({ token });
    await r.fulfill({ json: { data: { org_id: id }, meta: {} } });
  });
  await page.goto(`/workspace/invitations#token=${token}`);
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Invitation accepted.");
});
for (const width of [390, 768, 1440])
  test(`viewer shell at ${width}px has only functional navigation`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/workspace/evaluations?viewer=1");
    await expect(
      page.getByRole("heading", { name: "No evaluations yet" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Clients", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Assigned work", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/evals/design/workspace-${width}.png`,
      fullPage: true,
    });
    if (width === 390) {
      const trigger = page.getByRole("button", { name: "Open navigation" });
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page
          .getByRole("dialog")
          .getByRole("link", { name: "Evaluations", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
  });
test("operator desktop reference", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/evals/v1/**", (r) =>
    r.fulfill({ json: { data: [{ id, name: "Example client" }], meta: {} } }),
  );
  await page.goto("/ops");
  await expect(
    page.getByRole("rowheader", { name: "Example client" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/evals/design/operator-1440.png",
    fullPage: true,
  });
});
test("operator report queue stops loading on an API failure and retries safely", async ({ page }) => {
  let evaluationReads = 0;
  await page.route("**/api/evals/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/workspaces"))
      return route.fulfill({ json: { data: [{ id, name: "Example client" }], meta: {} } });
    if (path.endsWith("/evaluations")) {
      evaluationReads += 1;
      if (evaluationReads === 1)
        return route.fulfill({ status: 503, json: { error: {
          code: "SERVICE_UNAVAILABLE",
          message: "database password=must-not-render",
          request_id: "safe-reference-123",
        } } });
      return route.fulfill({ json: { data: { evaluations: [], runs: [], reports: [] }, meta: {} } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND" } } });
  });

  await page.goto("/ops/reports");
  await expect(page.getByText(/Reference: safe-reference-123/)).toBeVisible();
  await expect(page.getByText("Loading workspaces…")).toHaveCount(0);
  await expect(page.getByText("database password=must-not-render")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No published reports yet" })).toBeVisible();
  expect(evaluationReads).toBe(2);
});

test("workspace reports distinguish an API failure from an empty report list", async ({ page }) => {
  let summaryReads = 0;
  await page.route("**/api/evals/v1/workspace/summary?**", async (route) => {
    summaryReads += 1;
    if (summaryReads === 1)
      return route.fulfill({ status: 503, json: { error: {
        code: "SERVICE_UNAVAILABLE",
        message: "private database detail",
        request_id: "workspace-reference-456",
      } } });
    return route.fulfill({ json: { data: {
      reports: [], evaluations: [], systems: [],
      entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: [], can_export: true, can_schedule: false },
      usage: { settled: "0", outstanding: "0" },
      preferences: { completion: true, required_input: true, failure: true, email: false },
    }, meta: {} } });
  });

  await page.goto("/workspace/reports");
  await expect(page.getByText(/workspace-reference-456/)).toBeVisible();
  await expect(page.getByText("Loading workspaces…")).toHaveCount(0);
  await expect(page.getByText("private database detail")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No published reports yet" })).toBeVisible();
  expect(summaryReads).toBe(2);
});

test("improvement datasets offer retry instead of showing a false empty state", async ({ page }) => {
  let batchReads = 0;
  await page.route("**/api/evals/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/improvement-batches")) {
      batchReads += 1;
      if (batchReads === 1)
        return route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", request_id: "improvement-reference-789" } } });
      return route.fulfill({ json: { data: [], meta: {} } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND" } } });
  });

  await page.goto("/ops/improvements");
  await expect(page.getByText(/improvement-reference-789/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "No improvement batches" })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No improvement batches" })).toBeVisible();
  expect(batchReads).toBe(2);
});
test("Stage C connection flow is keyboard usable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/workspace/evaluations/new?orgId=${id}`);
  await expect(page.getByRole("heading", { name: "New evaluation" })).toBeVisible();
  await page.getByLabel("Website chatbot").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("API", { exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("Stage C website connection requires an authority attestation before probing", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000030";
  const evaluationId = "00000000-0000-4000-8000-000000000031";
  const targetId = "00000000-0000-4000-8000-000000000032";
  const targetRevisionId = "00000000-0000-4000-8000-000000000033";
  const requests: string[] = [];
  await page.route("**/api/evals/v1/projects", (route) => { requests.push("project"); return route.fulfill({ json: { data: { id: projectId }, meta: {} } }); });
  await page.route("**/api/evals/v1/evaluations", (route) => { requests.push("evaluation"); return route.fulfill({ json: { data: { id: evaluationId }, meta: {} } }); });
  await page.route(`**/api/evals/v1/projects/${projectId}/targets`, (route) => { requests.push("target"); return route.fulfill({ json: { data: { id: targetRevisionId, target_id: targetId }, meta: {} } }); });
  await page.route(`**/api/evals/v1/projects/${projectId}/authorizations`, (route) => {
    requests.push("attestation");
    expect(route.request().postDataJSON()).toMatchObject({ targetId, confirmed: true });
    return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000034" }, meta: {} } });
  });
  await page.route(`**/api/evals/v1/targets/${targetRevisionId}/checks`, (route) => { requests.push("check"); return route.fulfill({ json: { data: { status: "queued" }, meta: {} } }); });
  await page.goto(`/workspace/evaluations/new?orgId=${id}&editor`);
  await page.getByLabel("Project name").fill("Support policies");
  await page.getByLabel("System name").fill("Support bot");
  await page.getByLabel("What should this system help people do?").fill("Answer customer questions");
  await page.getByLabel("Website URL").fill("https://example.com/chat");
  await expect(page.getByRole("button", { name: "Connect system" })).toBeDisabled();
  await page.getByLabel(/authorized to test this system/i).check();
  await expect(page.getByRole("button", { name: "Connect system" })).toBeEnabled();
  await page.getByRole("button", { name: "Connect system" }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/evaluations/${evaluationId}`));
  expect(requests).toEqual(["project", "evaluation", "target", "attestation", "check"]);
});
test("Stage C manual connection waits for questions before requesting answers", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000040";
  const evaluationId = "00000000-0000-4000-8000-000000000041";
  const requests: string[] = [];
  await page.route("**/api/evals/v1/projects", (route) => { requests.push("project"); return route.fulfill({ json: { data: { id: projectId }, meta: {} } }); });
  await page.route("**/api/evals/v1/evaluations", (route) => { requests.push("evaluation"); return route.fulfill({ json: { data: { id: evaluationId }, meta: {} } }); });
  await page.route(`**/api/evals/v1/projects/${projectId}/targets`, (route) => {
    requests.push("target");
    expect(route.request().postDataJSON().config).toMatchObject({ kind: "imported_responses", source_path: "imports/manual-answers" });
    return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000042" }, meta: {} } });
  });
  await page.goto(`/workspace/evaluations/new?orgId=${id}&editor`);
  await page.getByLabel("Upload answers").check();
  await page.getByLabel("Project name").fill("Support policies");
  await page.getByLabel("System name").fill("Support bot");
  await page.getByLabel("What should this system help people do?").fill("Answer customer questions");
  await expect(page.getByText(/Prepare and approve your questions first/)).toBeVisible();
  await page.getByRole("button", { name: "Connect system" }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/evaluations/${evaluationId}`));
  expect(requests).toEqual(["project", "evaluation", "target"]);
});
test("Stage C manual answers reach a private preliminary report only after matching", async ({ page }) => {
  const evaluationId = "00000000-0000-4000-8000-000000000050";
  const projectId = "00000000-0000-4000-8000-000000000051";
  const runId = "00000000-0000-4000-8000-000000000052";
  const suiteVersionId = "00000000-0000-4000-8000-000000000053";
  const importId = "00000000-0000-4000-8000-000000000054";
  const reportId = "00000000-0000-4000-8000-000000000055";
  const revisionId = "00000000-0000-4000-8000-000000000056";
  let applied = false;
  let published = false;
  const requests: string[] = [];
  await page.route("**/api/evals/v1/workspace/summary?**", (route) => route.fulfill({ json: { data: {
    evaluations: [{ id: evaluationId, project_id: projectId, title: "Support policy", project_title: "Support policy", project_description: "Support questions", latest_source_id: null, latest_source_revision_id: null, preparation_status: "awaiting_answers", reason_code: null, selected_suite_version_id: suiteVersionId, latest_run_id: runId, latest_run_status: applied ? "completed" : "paused", latest_run_phase: applied ? "reporting" : "preflight" }],
    systems: [{ id: "00000000-0000-4000-8000-000000000057", project_id: projectId, title: "Manual answers", target_revision_id: "00000000-0000-4000-8000-000000000058", document: { kind: "imported_responses" }, connection_status: null, error_code: null }],
    reports: published ? [{ id: reportId, title: "Preliminary evaluation results", current_revision_id: revisionId, evaluation_id: evaluationId }] : [],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["imported_responses"], can_export: true }, usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
  }, meta: {} } }));
  await page.route(`**/api/evals/v1/runs/${runId}?**`, (route) => route.fulfill({ json: { data: { run: { id: runId, status: applied ? "completed" : "paused", phase: applied ? "reporting" : "preflight", execution_mode: "imported_responses", suite_version_id: suiteVersionId }, units: [{ id: "unit", status: applied ? "succeeded" : "pending" }] }, meta: {} } }));
  await page.route("**/api/evals/v1/imports", (route) => { requests.push("import"); expect(route.request().postData()).toContain("manual_answers"); return route.fulfill({ json: { data: { id: importId }, meta: {} } }); });
  await page.route(`**/api/evals/v1/imports/${importId}/apply`, (route) => { requests.push("apply"); applied = true; return route.fulfill({ json: { data: { saved: 1, errors: [], missing: [], complete: true }, meta: {} } }); });
  await page.route(`**/api/evals/v1/runs/${runId}/score`, (route) => { requests.push("score"); return route.fulfill({ json: { data: { created: 1 }, meta: {} } }); });
  await page.route("**/api/evals/v1/reports", (route) => { requests.push("report"); expect(route.request().postDataJSON()).toMatchObject({ reviewStatus: "preliminary", runId }); return route.fulfill({ json: { data: { reportId, revisionId }, meta: {} } }); });
  await page.route(`**/api/evals/v1/reports/${reportId}/publish`, (route) => { requests.push("publish"); published = true; return route.fulfill({ json: { data: { reportId }, meta: {} } }); });
  await page.goto(`/workspace/evaluations/${evaluationId}?orgId=${id}&editor`);
  await expect(page.getByRole("heading", { name: "Collect answers from your system" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download question sheet (CSV)" })).toHaveAttribute("href", new RegExp(`/suites/${suiteVersionId}/candidate-template`));
  await page.getByLabel("Completed answer sheet").setInputFiles({ name: "answers.csv", mimeType: "text/csv", buffer: Buffer.from("suite_version_id,case_id,case_revision_id,input,system_answer\nsuite,case,revision,Question,Answer\n") });
  await page.getByRole("button", { name: "Upload answers" }).click();
  await expect(page.getByText("All answers matched. Your preliminary private report is ready.")).toBeVisible();
  expect(requests).toEqual(["import", "apply", "score", "report", "publish"]);
});
test("Stage C manual report finalization can resume after reopening", async ({ page }) => {
  const evaluationId = "00000000-0000-4000-8000-000000000060";
  const runId = "00000000-0000-4000-8000-000000000061";
  const reportId = "00000000-0000-4000-8000-000000000062";
  const revisionId = "00000000-0000-4000-8000-000000000063";
  let published = false;
  await page.route("**/api/evals/v1/workspace/summary?**", (route) => route.fulfill({ json: { data: {
    evaluations: [{ id: evaluationId, project_id: "00000000-0000-4000-8000-000000000064", title: "Policy", project_title: "Policy", project_description: "", preparation_status: "ready", selected_suite_version_id: "00000000-0000-4000-8000-000000000065", latest_run_id: runId }],
    systems: [], reports: published ? [{ id: reportId, title: "Preliminary evaluation results", current_revision_id: revisionId, evaluation_id: evaluationId }] : [],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["imported_responses"], can_export: true }, usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
  }, meta: {} } }));
  await page.route(`**/api/evals/v1/runs/${runId}?**`, (route) => route.fulfill({ json: { data: { run: { id: runId, status: "completed", phase: "grading", execution_mode: "imported_responses" }, units: [{ id: "unit", status: "succeeded" }] }, meta: {} } }));
  await page.route(`**/api/evals/v1/runs/${runId}/score`, (route) => route.fulfill({ json: { data: { created: 1 }, meta: {} } }));
  await page.route("**/api/evals/v1/reports", (route) => route.fulfill({ json: { data: { reportId, revisionId }, meta: {} } }));
  await page.route(`**/api/evals/v1/reports/${reportId}/publish`, (route) => { published = true; return route.fulfill({ json: { data: { reportId }, meta: {} } }); });
  await page.goto(`/workspace/evaluations/${evaluationId}?orgId=${id}&editor`);
  await page.getByRole("button", { name: "Prepare preliminary report" }).click();
  await expect(page.getByRole("link", { name: "Review findings" })).toBeVisible();
});
test("Stage C customer can see source-backed test-set preparation after connecting", async ({ page }) => {
  const evaluationId = "00000000-0000-4000-8000-000000000010";
  const projectId = "00000000-0000-4000-8000-000000000011";
  const sourceId = "00000000-0000-4000-8000-000000000014";
  const revisionId = "00000000-0000-4000-8000-000000000015";
  const suiteId = "00000000-0000-4000-8000-000000000017";
  const suiteVersionId = "00000000-0000-4000-8000-000000000018";
  let approved = false;
  let generated = false;
  const requests: string[] = [];
  await page.route(`**/api/evals/v1/evaluations/${evaluationId}/context**`, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: {
      draft: { suiteId, suiteVersionId, suiteDraftVersion: 1 },
      casePreviews: [{ caseRevisionId: "00000000-0000-4000-8000-000000000019", question: "When can I request a refund?", approvedAnswer: "Within 30 days.", sourceExcerpt: "Refunds are accepted within 30 days." }],
    }, meta: {} } });
    requests.push("context");
    return route.fulfill({ json: { data: { status: "generating" }, meta: {} } });
  });
  await page.route(`**/api/evals/v1/evaluations/${evaluationId}/generate`, (route) => {
    requests.push("generate"); generated = true;
    return route.fulfill({ json: { data: { status: "needs_review", suiteId, suiteVersionId, suiteDraftVersion: 1 }, meta: {} } });
  });
  await page.route(`**/api/evals/v1/suites/${suiteId}/versions`, (route) => {
    requests.push("freeze");
    return route.fulfill({ json: { data: { id: suiteVersionId }, meta: {} } });
  });
  await page.route(`**/api/evals/v1/evaluations/${evaluationId}/approve-suite`, (route) => {
    requests.push("approve"); approved = true;
    return route.fulfill({ json: { data: { status: "ready" }, meta: {} } });
  });
  await page.route(`**/api/evals/v1/sources/${sourceId}?**`, (route) => route.fulfill({ json: { data: {
    id: sourceId, revisions: [{ id: revisionId }], chunks: [{ id: "00000000-0000-4000-8000-000000000016", excerpt: "Refunds are accepted within 30 days." }],
  }, meta: {} } }));
  await page.route("**/api/evals/v1/workspace/summary?**", (route) => route.fulfill({ json: { data: {
    evaluations: [{ id: evaluationId, project_id: projectId, title: "Support policy", project_title: "Support policy", project_description: "Answer customer policy questions", latest_source_id: sourceId, latest_source_revision_id: revisionId, preparation_status: approved ? "ready" : generated ? "needs_review" : "draft", reason_code: null, selected_suite_version_id: approved ? suiteVersionId : null, latest_run_id: null, latest_run_status: null, latest_run_phase: null }],
    systems: [{ id: "00000000-0000-4000-8000-000000000012", title: "Support bot", target_revision_id: "00000000-0000-4000-8000-000000000013", document: { kind: "website" }, connection_status: "ready", error_code: null }],
    reports: [], entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true }, usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
  }, meta: {} } }));
  await page.goto(`/workspace/evaluations/${evaluationId}?orgId=${id}&editor`);
  await expect(page.getByRole("heading", { name: "Prepare a test set" })).toBeVisible();
  await expect(page.getByLabel("Example customer question")).toBeVisible();
  await expect(page.getByLabel("Approved answer")).toBeVisible();
  await expect(page.getByLabel("Supporting excerpt")).toContainText("Refunds are accepted within 30 days.");
  await page.getByLabel("Example customer question").fill("When can I request a refund?");
  await page.getByLabel("Approved answer").fill("Within 30 days.");
  await page.getByLabel("Supporting excerpt").selectOption("00000000-0000-4000-8000-000000000016");
  await page.getByRole("button", { name: "Prepare test set" }).click();
  await expect(page.getByRole("heading", { name: "Review your test set" })).toBeVisible();
  await expect(page.getByText("Question: When can I request a refund?")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Review your test set" })).toBeVisible();
  await expect(page.getByText("Approved answer: Within 30 days.")).toBeVisible();
  await page.getByRole("button", { name: "Approve test set" }).click();
  await expect(page.getByRole("button", { name: "Run evaluation" })).toBeVisible();
  expect(requests).toEqual(["context", "generate", "freeze", "approve"]);
});
test("Stage C customer can upload and finalize a source document", async ({ page }) => {
  const evaluationId = "00000000-0000-4000-8000-000000000020";
  const projectId = "00000000-0000-4000-8000-000000000021";
  const sourceId = "00000000-0000-4000-8000-000000000022";
  const revisionId = "00000000-0000-4000-8000-000000000023";
  const artifactId = "00000000-0000-4000-8000-000000000024";
  let uploaded = false;
  let finalized = false;
  await page.route("**/api/evals/v1/workspace/summary?**", (route) => route.fulfill({ json: { data: {
    evaluations: [{ id: evaluationId, project_id: projectId, title: "Refund policy", project_title: "Refund policy", project_description: "Answer refund questions", latest_source_id: finalized ? sourceId : null, latest_source_revision_id: finalized ? revisionId : null, preparation_status: "draft", reason_code: null, selected_suite_version_id: null, latest_run_id: null, latest_run_status: null, latest_run_phase: null }],
    systems: [], reports: [], entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true }, usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
  }, meta: {} } }));
  await page.route("**/api/evals/v1/sources/uploads", (route) => route.fulfill({ json: { data: { sourceId, artifactId, uploadUrl: `/api/evals/v1/artifacts/${artifactId}/upload?orgId=${id}` }, meta: {} } }));
  await page.route(`**/api/evals/v1/artifacts/${artifactId}/upload?**`, (route) => { uploaded = true; return route.fulfill({ json: { data: { uploaded: true }, meta: {} } }); });
  await page.route(`**/api/evals/v1/sources/${sourceId}/finalize`, (route) => { finalized = uploaded; return route.fulfill({ json: { data: { revisionId }, meta: {} } }); });
  await page.route(`**/api/evals/v1/sources/${sourceId}?**`, (route) => route.fulfill({ json: { data: { id: sourceId, revisions: finalized ? [{ id: revisionId }] : [], chunks: finalized ? [{ id: "00000000-0000-4000-8000-000000000025", excerpt: "Refunds are available within 30 days." }] : [] }, meta: {} } }));
  await page.goto(`/workspace/evaluations/${evaluationId}?orgId=${id}&editor`);
  await page.getByLabel("Policy document").setInputFiles({ name: "refunds.txt", mimeType: "text/plain", buffer: Buffer.from("Refunds are available within 30 days.") });
  await page.getByRole("button", { name: "Use this document" }).click();
  await expect(page.getByLabel("Example customer question")).toBeVisible();
  expect(uploaded && finalized).toBe(true);
});

const expertAssignmentId = "00000000-0000-4000-8000-000000000101";
const expertFixture = {
  id: expertAssignmentId,
  kind: "authoring",
  status: "assigned",
  evidence: {
    excerpts: [{ anchor: "policy-1", text: "Redacted policy excerpt" }],
    transcript: [{ role: "assistant", content: "Redacted answer under review" }],
  },
  guideline: { title: "Evidence review", instructions: "Use only the evidence shown here." },
  dueAt: null,
  ownRevision: null,
  model_identity: "PRIVATE_MODEL_SENTINEL",
  author_identity: "PRIVATE_AUTHOR_SENTINEL",
  unassigned_evidence: "PRIVATE_UNASSIGNED_SENTINEL",
};

test("expert workbench never renders hidden identities or unassigned evidence", async ({ page }) => {
  await page.route(`**/api/evals/v1/review/assignments/${expertAssignmentId}`, (route) =>
    route.fulfill({ json: { data: expertFixture, meta: {} } }),
  );
  await page.goto(`/review/assignments/${expertAssignmentId}`);
  await expect(page.getByText("Redacted policy excerpt")).toBeVisible();
  await expect(page.getByText("PRIVATE_MODEL_SENTINEL")).toHaveCount(0);
  await expect(page.getByText("PRIVATE_AUTHOR_SENTINEL")).toHaveCount(0);
  await expect(page.getByText("PRIVATE_UNASSIGNED_SENTINEL")).toHaveCount(0);
});

test("expert stale autosave reports a preserved conflict and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  let mutations = 0;
  await page.route(`**/api/evals/v1/review/assignments/${expertAssignmentId}`, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: expertFixture, meta: {} } });
    mutations += 1;
    expect(route.request().postDataJSON()).toMatchObject({ document: { flags: ["ambiguous"] } });
    return route.fulfill({ json: { data: mutations === 1
      ? { conflict: true, revisionId: "00000000-0000-4000-8000-000000000102", version: 2, lockVersion: 0 }
      : { conflict: false, revisionId: "00000000-0000-4000-8000-000000000103", version: 3, lockVersion: 3 }, meta: {} } });
  });
  await page.goto(`/review/assignments/${expertAssignmentId}`);
  await page.getByLabel("Answer").fill("Independent contribution");
  await page.getByLabel("Rationale").fill("The supplied excerpt supports this answer.");
  await page.getByLabel("Flag ambiguity").check();
  const save = page.getByRole("button", { name: "Save draft" });
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toContainText("Both versions were preserved");
  await page.getByRole("button", { name: "Continue editing" }).click();
  await expect(save).toBeFocused();
  const submit = page.getByRole("button", { name: "Submit work" });
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Work submitted for independent review");
  expect(mutations).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("expert queue and submission controls are keyboard reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route("**/api/evals/v1/review/assignments", (route) => route.fulfill({ json: { data: [
    { id: expertAssignmentId, kind: "authoring", status: "assigned", severity: "high", due_at: null, updated_at: new Date().toISOString() },
  ], meta: {} } }));
  await page.goto("/review");
  const open = page.getByRole("link", { name: "Open assignment" });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/review/assignments/${expertAssignmentId}$`));
});

test("operator resolves an expert save conflict and records manual payment", async ({ page }) => {
  const profileId = "00000000-0000-4000-8000-000000000104";
  const calls: string[] = [];
  await page.route("**/api/evals/v1/**", (route) => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.endsWith("/experts")) return route.fulfill({ json: { data: [{ id: profileId, user_id: "expert@example.test", domains: ["insurance"], credentials_status: "verified", terms_status: "accepted", eligibility_status: "eligible" }], meta: {} } });
    if (path.endsWith("/expert-assignments") && request.method() === "GET") return route.fulfill({ json: { data: [{ id: expertAssignmentId, assigned_profile_id: profileId, kind: "calibration", severity: "high", status: "conflict", review_phase: "blind", due_at: null }], meta: {} } });
    if (path.endsWith(`/expert-assignments/${expertAssignmentId}/payments`)) {
      calls.push("payment");
      expect(request.headers()["idempotency-key"]).toMatch(/^[a-f0-9-]{36}$/);
      expect(request.postDataJSON()).toMatchObject({ amount: "75.00", currency: "EUR", status: "planned" });
      return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000107" }, meta: {} } });
    }
    if (path.endsWith(`/expert-assignments/${expertAssignmentId}`) && request.method() === "PATCH") {
      calls.push("resolve");
      expect(request.postDataJSON()).toMatchObject({ action: "resolve_conflict", revisionId: "00000000-0000-4000-8000-000000000106" });
      return route.fulfill({ json: { data: { status: "in_progress" }, meta: {} } });
    }
    if (path.endsWith(`/expert-assignments/${expertAssignmentId}`)) return route.fulfill({ json: { data: {
      id: expertAssignmentId, assigned_profile_id: profileId, kind: "calibration", severity: "high", status: "conflict", review_phase: "blind", due_at: null,
      revisions: [{ id: "00000000-0000-4000-8000-000000000105", version: 1, status: "draft", conflict: false, created_at: new Date().toISOString() }, { id: "00000000-0000-4000-8000-000000000106", version: 2, status: "draft", conflict: true, created_at: new Date().toISOString() }],
    }, meta: {} } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND" } } });
  });
  await page.goto("/ops/experts");
  await page.getByRole("tab", { name: "Expert quality" }).click();
  await expect(page.getByText("Not enough reviewed work to rank")).toBeVisible();
  await page.getByRole("tab", { name: "Assignments" }).click();
  await page.getByRole("button", { name: "Inspect" }).click();
  await page.getByRole("button", { name: "Use revision 2" }).click();
  await expect(page.getByRole("status")).toContainText("Save conflict resolved");
  await page.getByLabel("Manual payment amount (EUR)").fill("75.00");
  await page.getByLabel("Payment note").fill("Invoice after acceptance");
  await page.getByRole("button", { name: "Add planned payment record" }).click();
  await expect(page.getByRole("status")).toContainText("No payment was sent automatically");
  expect(calls).toEqual(["resolve", "payment"]);
});

test("operator completes the improvement dataset release and held-out validation workflow", async ({ page }) => {
  const blockedBatch = "00000000-0000-4000-8000-000000000120";
  const readyBatch = "00000000-0000-4000-8000-000000000121";
  const itemRevision = "00000000-0000-4000-8000-000000000122";
  const artifactId = "00000000-0000-4000-8000-000000000123";
  const releaseId = "00000000-0000-4000-8000-000000000124";
  let released = false;
  const batches = [
    { id: blockedBatch, project_id: "00000000-0000-4000-8000-000000000125", title: "Rejected corrections", objective: "Do not release rejected work.", status: "draft", lock_version: 0, task_count: 1, item_count: 1 },
    { id: readyBatch, project_id: "00000000-0000-4000-8000-000000000126", title: "Claims policy corrections", objective: "Correct evidence-grounding failures.", status: released ? "released" : "in_review", lock_version: released ? 1 : 0, task_count: 1, item_count: 1 },
  ];
  await page.route("**/api/evals/v1/**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    if (path.endsWith("/improvement-batches") && request.method() === "GET")
      return route.fulfill({ json: { data: batches, meta: {} } });
    if (path.endsWith(`/improvement-batches/${blockedBatch}`)) return route.fulfill({ json: { data: {
      batch: batches[0], tasks: [{ id: "task-rejected", kind: "grounded_qa", split: "training", family_id: "rejected-family" }],
      items: [{ id: "item-rejected", revision_id: "revision-rejected", kind: "grounded_qa", split: "training", family_id: "rejected-family", decision: "reject", rights_status: "permitted", redaction_status: "approved" }], releases: [],
    }, meta: {} } });
    if (path.endsWith(`/improvement-batches/${readyBatch}/release`)) {
      expect(request.headers()["idempotency-key"]).toMatch(/^[a-f0-9-]{36}$/);
      expect(request.postDataJSON()).toEqual({ orgId: id, expectedVersion: 0 });
      released = true; batches[1].status = "released"; batches[1].lock_version = 1;
      return route.fulfill({ json: { data: { releaseId, artifactId, contentHash: "a".repeat(64), sha256: "b".repeat(64), byteSize: 2048, publicKeyFingerprint: "c".repeat(64) }, meta: {} } });
    }
    if (path.endsWith(`/improvement-batches/${readyBatch}/validate`)) {
      expect(request.headers()["idempotency-key"]).toMatch(/^[a-f0-9-]{36}$/);
      expect(request.postDataJSON()).toMatchObject({ orgId: id, releaseId, expectedVersion: 1 });
      return route.fulfill({ json: { data: { interventionId: "intervention-1", validationId: "validation-1", snapshot: {
        training: { count: 5, excluded: 0, baselineScore: 0.4, followupScore: 0.9, delta: 0.5 },
        validation: { count: 4, excluded: 0, baselineScore: 0.5, followupScore: 0.75, delta: 0.25 },
        holdout: { count: 3, excluded: 0, baselineScore: 0.5, followupScore: 0.67, delta: 0.17 },
        causality: "observational_after_recorded_intervention",
        limitations: ["This before/after comparison records an observed association and does not prove causality."],
      } }, meta: {} } });
    }
    if (path.endsWith(`/improvement-batches/${readyBatch}`)) return route.fulfill({ json: { data: {
      batch: batches[1], tasks: [{ id: "task-ready", kind: "corrected_response", split: "training", family_id: "claims-correction" }],
      items: [{ id: "item-ready", revision_id: itemRevision, kind: "corrected_response", split: "training", family_id: "claims-correction", decision: "approve", rights_status: "permitted", redaction_status: "approved" }],
      releases: released ? [{ id: releaseId, revision: 1, status: "ready", artifact_id: artifactId, content_hash: "a".repeat(64), public_key_fingerprint: "c".repeat(64) }] : [],
    }, meta: {} } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND" } } });
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/ops/improvements");
  await page.getByRole("button", { name: "Open Rejected corrections" }).click();
  await expect(page.getByRole("checkbox", { name: "Select rejected-family" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Release signed dataset" })).toBeDisabled();
  await expect(page.getByText(/requires independent approval/i)).toBeVisible();
  await page.getByRole("tab", { name: "Batches" }).click();
  await page.getByRole("button", { name: "Open Claims policy corrections" }).click();
  await page.getByRole("button", { name: "Release signed dataset" }).click();
  const download = page.getByRole("link", { name: "Download signed JSONL" });
  await expect(download).toHaveAttribute("href", `/api/evals/v1/dataset-artifacts/${artifactId}?orgId=${id}`);
  await expect(page.getByText(/cannot be revoked after download/i)).toBeVisible();
  await page.getByRole("tab", { name: "Follow-up evidence" }).click();
  await page.getByLabel("Baseline run ID").fill("00000000-0000-4000-8000-000000000127");
  await page.getByLabel("Follow-up run ID").fill("00000000-0000-4000-8000-000000000128");
  await page.getByLabel("Compatible comparison ID").fill("00000000-0000-4000-8000-000000000129");
  await page.getByLabel("Recorded customer intervention").fill("Customer updated the retrieval content.");
  await page.getByLabel("Intervention evidence reference").fill("change-ticket-42");
  await page.getByRole("button", { name: "Record follow-up evidence" }).click();
  for (const label of ["Training", "Validation", "Held-out"]) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText(/does not prove causality/i)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("Stage C result inspector is nonmodal on desktop and modal with focus on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/workspace/reports/fixture");
  await page.getByRole("tab", { name: "Test results" }).click();
  await page.getByRole("button", { name: /Refund eligibility/ }).click();
  await expect(page.locator(".eval-result-desktop")).toContainText("30-day policy");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("30-day policy");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("retry after a lost response reuses the same creation key", async ({
  page,
}) => {
  const keys: string[] = [];
  await page.route("**/api/evals/v1/workspaces", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({ json: { data: [], meta: {} } });
    keys.push(r.request().headers()["idempotency-key"]);
    if (keys.length === 1) return r.abort("failed");
    await r.fulfill({ json: { data: { id, name: "Retry client" }, meta: {} } });
  });
  await page.goto("/ops");
  await page.getByLabel("Client name", { exact: true }).fill("Retry client");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Retry client", exact: true }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});
test("unavailable invitation offers a replacement without showing success", async ({
  page,
}) => {
  await page.route("**/api/evals/v1/invitations/accept", (r) =>
    r.fulfill({
      status: 404,
      json: { error: { code: "SCOPE_DENIED", message: "Unavailable" } },
    }),
  );
  await page.goto(`/workspace/invitations#token=${token}`);
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Ask your workspace owner for a new link",
  );
  await expect(
    page.getByRole("link", { name: "Go to evaluations" }),
  ).toHaveCount(0);
});
test("actual Better Auth SDK signs in and keeps the invitation return path", async ({
  page,
}) => {
  const destination = `/workspace/invitations#token=${token}`;
  await page.route("**/api/auth/sign-in/email", async (r) => {
    expect(r.request().postDataJSON()).toMatchObject({
      email: "member@example.test",
      password: "existing-password",
      callbackURL: "/workspace/invitations",
      rememberMe: true,
    });
    await r.fulfill({
      json: {
        user: { id: "member" },
        token: "test-session",
        redirect: true,
        url: "https://untrusted.example.test",
      },
    });
  });
  await page.goto(`/workspace/sign-in#next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email address").fill("member@example.test");
  await page.getByLabel("Password", { exact: true }).fill("existing-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Accept invitation", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Invitation token")).toHaveValue(token);
});
test("actual Better Auth TOTP challenge stays in evaluation UI, rejects bad code and verifies", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/auth/sign-in/email", (r) =>
    r.fulfill({ json: { twoFactorRedirect: true } }),
  );
  await page.route("**/api/auth/two-factor/verify-totp", async (r) => {
    attempts++;
    expect(r.request().postDataJSON()).toEqual({
      code: attempts === 1 ? "111111" : "222222",
      trustDevice: false,
    });
    await r.fulfill(
      attempts === 1
        ? {
            status: 401,
            json: { code: "INVALID_TWO_FACTOR_COOKIE", message: "Expired" },
          }
        : { json: { user: { id: "member" }, token: "test-session" } },
    );
  });
  await page.goto("/workspace/sign-in?next=%2Fworkspace%2Fevaluations");
  await page.getByLabel("Email address").fill("member@example.test");
  await page.getByLabel("Password", { exact: true }).fill("existing-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Authenticator code")).toBeFocused();
  await expect(page).toHaveURL(/\/workspace\/sign-in/);
  await page.getByLabel("Authenticator code").fill("111111");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("alert")).toContainText("session has expired");
  await page.getByLabel("Authenticator code").fill("222222");
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page).toHaveURL(/\/workspace\/evaluations$/);
});
test("external and auth-loop destinations fall back to evaluation entry", async ({
  page,
}) => {
  await page.route("**/api/auth/sign-in/email", async (r) => {
    expect(r.request().postDataJSON().callbackURL).toBe("/evaluation-entry");
    await r.fulfill({
      status: 401,
      json: {
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Internal text must not leak",
      },
    });
  });
  for (const next of [
    "https://example.test",
    "//example.test",
    "/workspace/sign-in?next=/workspace/sign-in",
    "/auth/sign-in",
    "/admin",
  ]) {
    await page.goto(`/workspace/sign-in?next=${encodeURIComponent(next)}`);
    await page.getByLabel("Email address").fill("member@example.test");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Check your email and password",
    );
    await expect(
      page.getByRole("link", { name: "Recover account" }),
    ).toHaveAttribute(
      "href",
      "/workspace/reset-password?next=%2Fevaluation-entry",
    );
  }
});
test("password recovery uses actual SDK, preserves next and hides account existence", async ({
  page,
}) => {
  await page.route("**/api/auth/request-password-reset", async (r) => {
    expect(r.request().postDataJSON()).toEqual({
      email: "member@example.test",
      redirectTo:
        "http://127.0.0.1:4187/workspace/reset-password?next=%2Fworkspace%2Fevaluations",
    });
    await r.fulfill({ json: { status: true } });
  });
  await page.goto("/workspace/reset-password?next=%2Fworkspace%2Fevaluations");
  await page.getByLabel("Email address").fill("member@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "If this email has an account",
  );
  await expect(
    page.getByRole("link", { name: "Back to sign in" }),
  ).toHaveAttribute(
    "href",
    "/workspace/sign-in?next=%2Fworkspace%2Fevaluations",
  );
});
test("reset password validates confirmation, handles expired token and succeeds via SDK", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/auth/reset-password", async (r) => {
    attempts++;
    expect(r.request().postDataJSON()).toEqual({
      token: "reset-test-token",
      newPassword: "new-test-password",
    });
    await r.fulfill(
      attempts === 1
        ? { status: 400, json: { code: "INVALID_TOKEN", message: "Invalid" } }
        : { json: { status: true } },
    );
  });
  await page.goto(
    "/workspace/reset-password?token=reset-test-token&next=%2Fworkspace%2Fevaluations",
  );
  await expect(page).not.toHaveURL(/token=/);
  await page
    .getByLabel("New password", { exact: true })
    .fill("new-test-password");
  await page.getByLabel("Confirm new password").fill("different-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The passwords do not match.",
  );
  expect(attempts).toBe(0);
  await page.getByLabel("Confirm new password").fill("new-test-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("alert")).toContainText("Request a new link");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveAttribute(
    "href",
    "/workspace/sign-in?next=%2Fworkspace%2Fevaluations",
  );
});
test("invalid recovery callback offers a new link, auth form fits mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace/reset-password?error=INVALID_TOKEN");
  await expect(page.getByRole("alert")).toContainText("Request a new link");
  await expect(
    page.getByRole("button", { name: "Send reset link" }),
  ).toBeVisible();
  await page.goto("/workspace/sign-in");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/evals/design/sign-in-390.png",
    fullPage: true,
  });
});

test("expired reset can switch to a fresh recovery request without reusing its token", async ({
  page,
}) => {
  await page.route("**/api/auth/reset-password", (r) =>
    r.fulfill({ status: 400, json: { code: "INVALID_TOKEN" } }),
  );
  await page.goto("/workspace/reset-password?token=expired");
  await page
    .getByLabel("New password", { exact: true })
    .fill("new-test-password");
  await page.getByLabel("Confirm new password").fill("new-test-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Request a new recovery link" })
    .click();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send reset link" }),
  ).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
});
for (const width of [390, 1440])
  test(`sign-out POST works from the ${width}px shell`, async ({ page }) => {
    let calls = 0;
    await page.route("**/api/auth/sign-out", async (route) => {
      calls++;
      expect(route.request().method()).toBe("POST");
      await route.fulfill({ json: { success: true } });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/workspace/evaluations?viewer=1");
    if (width === 390)
      await page.getByRole("button", { name: "Open navigation" }).click();
    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\/sign-in$/);
    await expect(
      page.getByRole("heading", { name: "Sign in to Caudals" }),
    ).toBeVisible();
    expect(calls).toBe(1);
  });
for (const failure of ["server", "network"])
  test(`sign-out ${failure} failure keeps shell and permits retry`, async ({
    page,
  }) => {
    let calls = 0;
    await page.route("**/api/auth/sign-out", async (route) => {
      calls++;
      expect(route.request().method()).toBe("POST");
      if (calls === 1) {
        if (failure === "network") return route.abort("failed");
        return route.fulfill({
          status: 500,
          json: { code: "FAILED", message: "Internal details" },
        });
      }
      await route.fulfill({ json: { success: true } });
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/workspace/evaluations?viewer=1");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await openAccountMenu(page);
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    // The failure alert stays in the shell the user is still in.
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
      "Sign-out could not be completed. Check your connection and try again.",
    );
    await expect(page).toHaveURL(/\/workspace\/evaluations\?viewer=1$/);
    await openAccountMenu(page);
    const retry = page.getByRole("menuitem", { name: "Sign out", exact: true });
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(page).toHaveURL(/\/workspace\/sign-in$/);
    expect(calls).toBe(2);
  });
test("invitation bearer stays in fragments through anonymous entry and sign-in", async ({
  page,
}) => {
  const requests: { url: string; referer: string }[] = [];
  page.on("request", (r) =>
    requests.push({ url: r.url(), referer: r.headers().referer ?? "" }),
  );
  await page.route("**/api/auth/sign-in/email", async (r) => {
    expect(r.request().postDataJSON().callbackURL).toBe(
      "/workspace/invitations",
    );
    expect(r.request().postData() ?? "").not.toContain(token);
    await r.fulfill({
      json: { user: { id: "member" }, token: "session", redirect: false },
    });
  });
  await page.goto(`/workspace/invitations?anonymous=1#token=${token}`);
  await expect(page.getByLabel("Invitation token")).toHaveValue(token);
  await expect(page).toHaveURL(/\/workspace\/invitations$/);
  const signIn = page.getByRole("link", {
    name: "Already have an account? Sign in to accept",
  });
  await expect(signIn).toHaveAttribute(
    "href",
    `/workspace/sign-in#next=${encodeURIComponent(`/workspace/invitations#token=${token}`)}`,
  );
  await signIn.click();
  await expect(page).toHaveURL(/\/workspace\/sign-in$/);
  await expect(
    page.getByRole("link", { name: "Recover account" }),
  ).toHaveAttribute(
    "href",
    "/workspace/reset-password?next=%2Fworkspace%2Finvitations",
  );
  await page.getByLabel("Email address").fill("member@example.test");
  await page.getByLabel("Password", { exact: true }).fill("existing-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Invitation token")).toHaveValue(token);
  await expect(page).toHaveURL(/\/workspace\/invitations$/);
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(decodeURIComponent(request.url)).not.toContain(token);
    expect(decodeURIComponent(request.referer)).not.toContain(token);
  }
});
test("invitation expiry recovery uses fragment-only next and rejects arbitrary hash targets", async ({
  page,
}) => {
  await page.route("**/api/evals/v1/invitations/accept", (r) =>
    r.fulfill({ status: 401, json: { error: { code: "SESSION_REQUIRED" } } }),
  );
  await page.goto(`/workspace/invitations#token=${token}`);
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Sign in again" }),
  ).toHaveAttribute(
    "href",
    `/workspace/sign-in#next=${encodeURIComponent(`/workspace/invitations#token=${token}`)}`,
  );
  for (const next of [
    "https://evil.example/workspace/invitations#token=" + token,
    "/workspace/sign-in#token=" + token,
    "/workspace/invitations#token=invalid",
  ]) {
    await page.goto(`/workspace/sign-in#next=${encodeURIComponent(next)}`);
    await expect(page).toHaveURL(/\/workspace\/sign-in$/);
    const href = await page
      .getByRole("link", { name: "Recover account" })
      .getAttribute("href");
    expect(href).not.toContain(token);
    expect(href).not.toContain("evil.example");
  }
});
test("invitation query tokens are not read into client state", async ({
  page,
}) => {
  await page.goto(`/workspace/invitations?token=${token}`);
  await expect(page.getByLabel("Invitation token")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Accept invitation", exact: true }),
  ).toBeDisabled();
});

test("workspace owner creates a pinned monitoring schedule", async ({ page }) => {
  const evaluationId = "00000000-0000-4000-8000-000000000080";
  const targetRevisionId = "00000000-0000-4000-8000-000000000081";
  const suiteVersionId = "00000000-0000-4000-8000-000000000082";
  let created: Record<string, unknown> | null = null;
  await page.route("**/api/evals/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/workspace/summary"))
      return route.fulfill({ json: { data: {
        evaluations: [{ id: evaluationId, title: "Support monitor", project_id: "project-1", project_title: "Support", project_description: "", latest_source_id: null, latest_source_revision_id: null, preparation_status: "ready", reason_code: null, selected_suite_version_id: suiteVersionId, commercial_cap: "25", currency: "EUR", latest_run_id: null, latest_run_status: null, latest_run_phase: null }],
        systems: [{ id: "target-1", project_id: "project-1", title: "Support API", target_revision_id: targetRevisionId, document: { kind: "https_json" }, connection_status: "ready", runner_status: null, runner_id: null, error_code: null }],
        reports: [], entitlement: { max_active_runs: 2, monthly_spend_limit: "200", currency: "EUR", allowed_connection_types: ["https_json"], can_export: true, can_schedule: true },
        usage: { settled: "0", outstanding: "0" }, preferences: { completion: true, required_input: true, failure: true, email: false },
      }, meta: {} } });
    if (path.endsWith("/schedules") && request.method() === "POST") {
      expect(request.headers()["idempotency-key"]).toMatch(/^[a-f0-9-]{36}$/);
      created = request.postDataJSON();
      return route.fulfill({ json: { data: { id: "schedule-1" }, meta: {} } });
    }
    if (path.endsWith("/schedules") || path.endsWith("/alerts") || path.endsWith("/webhooks") || path.endsWith("/tokens"))
      return route.fulfill({ json: { data: [], meta: {} } });
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND" } } });
  });
  await page.goto(`/workspace/settings?owner=1`);
  await expect(page.getByRole("heading", { name: "Scheduled monitoring" })).toBeVisible();
  await page.getByLabel("Cadence").selectOption("monthly");
  await page.getByLabel("Day of month (1–31)").fill("31");
  await page.getByLabel("IANA timezone").fill("Europe/Madrid");
  await page.getByRole("button", { name: "Create schedule" }).click();
  await expect(page.getByRole("status")).toHaveText("Schedule created.");
  expect(created).toMatchObject({ orgId: id, evaluationId, targetRevisionId, suiteVersionId, cadence: "monthly", dayOfMonth: 31, timezone: "Europe/Madrid", maxRunSpend: "25", currency: "EUR" });
});
