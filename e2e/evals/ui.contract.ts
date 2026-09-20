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
