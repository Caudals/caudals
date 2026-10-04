import { test, expect } from "@playwright/test";
const id = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(43);
test("web app studio streams live pixels, teaches in one click and offers repair", async ({ page }) => {
  let teach = "idle", test = "idle", teachError: string | null = null, mode = "control", pickPart: string | null = null;
  const commands: string[] = [];
  const parts: Record<string, unknown> = {};
  // A real JPEG so the canvas decode path runs.
  const frame = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
  const state = () => ({ sessionId: "00000000-0000-4000-8000-000000000801", mode, pickPart, url: "https://app.example.test/chat", title: "Chat", loading: false, tabs: [{ index: 0, url: "https://app.example.test/chat", active: true }],
    parts, completion: teach === "idle" ? null : "selector_hidden", teach: { status: teach, error: teachError, step: teach === "running" ? "read_reply" : null, reply: "" },
    test: { status: test, error: null, step: null, response: test === "ready" ? "Our refund window is 30 days." : "" }, expiresAt: new Date(Date.now() + 1_800_000).toISOString() });
  await page.route("**/api/evals/v1/**", async route => {
    const url = route.request().url();
    if (url.includes("/web-app/stream")) {
      await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: `retry: 200\n\ndata: ${JSON.stringify({ type: "frame", seq: 1, image: frame, width: 1280, height: 800 })}\n\ndata: ${JSON.stringify({ type: "state", state: state() })}\n\n` });
      return;
    }
    let data: unknown = [];
    if (url.includes("/web-app")) {
      const command = route.request().postDataJSON().command; commands.push(command.action);
      if (command.action === "open") data = { sessionId: "00000000-0000-4000-8000-000000000801", sessionExpired: true };
      else if (command.action === "autoteach") {
        if (commands.filter(value => value === "autoteach").length === 1) { teach = "failed"; teachError = "chat_input_not_found"; }
        else { teach = "ready"; test = "ready"; teachError = null; Object.assign(parts, { input: { kind: "role", frames: 1, rect: { x: 900, y: 700, width: 300, height: 40 } }, submit: { kind: "role", frames: 1, rect: { x: 1210, y: 700, width: 40, height: 40 } }, response: { kind: "css", frames: 1, rect: { x: 900, y: 500, width: 340, height: 80 } } }); }
        data = { status: "running" };
      }
      else if (command.action === "mode") { mode = command.mode; pickPart = command.part ?? null; data = { mode }; }
      else if (command.action === "result") data = { saved: true, status: "ready" };
      else if (command.action === "input") data = { ok: true };
    }
    await route.fulfill({ json: { data, meta: {} } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/workspace/web-app-fixture?owner");
  await page.getByRole("button", { name: "Open live browser" }).click();
  await expect(page.getByText("Your saved login has expired.", { exact: false })).toBeVisible();
  const studio = page.getByRole("dialog", { name: "Web app connection" });
  await expect(studio).toBeVisible();
  const viewport = studio.getByRole("application");
  await expect(viewport.locator("canvas")).toBeVisible();
  await viewport.click({ position: { x: 200, y: 120 } });
  await page.keyboard.type("hello");
  await expect.poll(() => commands.filter(value => value === "input").length).toBeGreaterThan(0);
  await expect(studio.getByRole("heading", { name: "What Caudals uses" })).toHaveCount(0);
  await studio.getByRole("button", { name: "Connect system", exact: true }).click();
  await expect(studio.getByText("No chat box was found.", { exact: false })).toBeVisible();
  await expect(studio.getByRole("heading", { name: "What Caudals uses" })).toBeVisible();
  await studio.getByRole("listitem").filter({ hasText: "Reply" }).getByRole("button", { name: "Fix" }).click();
  await expect(studio.getByText("Click the Reply in the browser.", { exact: false })).toBeVisible();
  await studio.getByRole("button", { name: "Cancel", exact: true }).click();
  await studio.getByRole("button", { name: "Connect again", exact: true }).click();
  await expect(studio.getByText("Connected. Complete replies", { exact: false })).toBeVisible();
  await expect.poll(() => commands.includes("result")).toBe(true);
  await expect(studio.locator('.p-web-mark[data-part="response"]')).toBeVisible();
  await expect(studio.getByRole("heading", { name: "What Caudals uses" })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/caudals-webapp-connector-ui.png" });
  await studio.getByRole("button", { name: "Close browser", exact: true }).click();
  await expect(studio).toBeHidden();
  expect(commands).toContain("close");
});
/** A customer-safe workspace summary, with optional evaluations and reports. */
function summaryFixture(extra: { evaluations?: unknown[]; reports?: unknown[]; systems?: unknown[] } = {}) {
  return {
    evaluations: [], systems: [], reports: [],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["openai_compatible", "website", "imported_responses"], can_export: true, can_schedule: true },
    usage: { settled: "0", outstanding: "0" },
    preferences: { completion: true, required_input: true, failure: true, email: false },
    ...extra,
  };
}
const evaluationFixture = {
  id: "00000000-0000-4000-8000-000000000501", title: "Claims assistant review", project_id: "00000000-0000-4000-8000-000000000601",
  project_title: "Claims", project_description: "", latest_source_id: null, latest_source_revision_id: null,
  preparation_status: "ready", reason_code: null, selected_suite_version_id: "00000000-0000-4000-8000-000000000701",
  commercial_cap: "500", currency: "EUR", latest_run_id: null, latest_run_status: null, latest_run_phase: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
};
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
  const invitations: Array<Record<string, unknown>> = [];
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
    } else if (path.endsWith("/invitations")) {
      if (r.method() === "POST") {
        expect(path).toContain(id);
        expect(r.postDataJSON()).toEqual({
          email: "viewer@example.test",
          role: "viewer",
        });
        const invitation = {
          id: "invite-one",
          email: "viewer@example.test",
          role: "viewer",
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          accepted_at: null,
          revoked_at: null,
        };
        invitations.push(invitation);
        data = { ...invitation, token };
      } else data = invitations;
    } else if (r.method() === "DELETE") {
      expect(new URL(r.url()).searchParams.get("orgId")).toBe(id);
      invitations[0].revoked_at = new Date().toISOString();
      data = { revoked: true };
    } else if (path.endsWith("/workspace/summary")) {
      return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Not found" } } });
    }
    await route.fulfill({ json: { data, meta: {} } });
  });
  await page.goto("/ops/clients");
  for (const name of ["Client one", "Client two"]) {
    await page.getByRole("button", { name: "New client", exact: true }).first().click();
    await page.getByLabel("Client name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Create client", exact: true }).click();
    await expect(page.getByText(`Client created: ${name}`)).toBeVisible();
    // The harness identity is static; in the app the refreshed identity opens the new client's panel.
    await page.keyboard.press("Escape");
  }
  // Invitations are scoped to the selected client (the harness identity's workspace).
  await page.getByRole("button", { name: "Example client", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Example client" });
  await panel.getByRole("button", { name: "Create invitation", exact: true }).click();
  await page.getByLabel("Email address").fill("viewer@example.test");
  await page
    .getByRole("dialog", { name: /Invite/ })
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(page.getByLabel("Private invitation link")).toHaveValue(
    `http://127.0.0.1:4187/workspace/invitations#token=${token}`,
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await panel.getByRole("button", { name: "Revoke invitation", exact: true }).click();
  await expect(page.getByText("Invitation revoked.")).toBeVisible();
  await expect(panel.getByRole("table").getByText("Revoked", { exact: true })).toBeVisible();
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
  // Sign-in returns to the page the session expired on.
  await expect(
    page.getByRole("link", { name: "Sign in again" }),
  ).toHaveAttribute("href", "/workspace/sign-in?next=%2Fops");
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
      page.getByRole("heading", { name: "Run your first evaluation" }),
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
    r.fulfill({ json: { data: new URL(r.request().url()).pathname.endsWith("/workspace/summary") ? summaryFixture({ evaluations: [evaluationFixture] }) : [{ id, name: "Example client" }], meta: {} } }),
  );
  await page.goto("/ops?filter=all");
  await expect(page.getByRole("link", { name: /Claims assistant review/ })).toBeVisible();
  await expect(page.getByText("Ready to run")).toBeVisible();
  await page.screenshot({
    path: "docs/evals/design/operator-1440.png",
    fullPage: true,
  });
});
test("operator overview shows a support reference on an API failure and retries safely", async ({ page }) => {
  let summaryReads = 0;
  await page.route("**/api/evals/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/workspace/summary")) {
      summaryReads += 1;
      if (summaryReads === 1)
        return route.fulfill({ status: 503, json: { error: {
          code: "SERVICE_UNAVAILABLE",
          message: "database password=must-not-render",
          request_id: "safe-reference-123",
        } } });
      return route.fulfill({ json: { data: summaryFixture(), meta: {} } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND" } } });
  });

  await page.goto("/ops");
  await expect(page.getByText(/Reference: safe-reference-123/)).toBeVisible();
  await expect(page.getByText("database password=must-not-render")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No evaluations yet" })).toBeVisible();
  await expect(page.getByText(/Reference: safe-reference-123/)).toHaveCount(0);
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
  await page.getByLabel("Website chatbot", { exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("API", { exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("Stage C website connection records the testing attestation without asking for a checkbox", async ({ page }) => {
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
  await page.getByLabel("Name", { exact: true }).fill("Support bot");
  await page.getByLabel("What should this system help people do?").fill("Answer customer questions");
  await expect(page.getByRole("button", { name: "Create evaluation" })).toBeDisabled();
  await page.getByLabel("Website URL").fill("https://example.com/chat");
  await expect(page.getByLabel(/authorized to test it/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create evaluation" })).toBeEnabled();
  await page.getByRole("button", { name: "Create evaluation" }).click();
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
  await page.route("**/api/evals/v1/workspace/summary?**", (route) => route.fulfill({ json: { data: summaryFixture(), meta: {} } }));
  await page.goto(`/workspace/evaluations/new?orgId=${id}&editor`);
  await page.locator("label.p-choice", { hasText: "Upload answers" }).click();
  await expect(page.getByLabel("Upload answers", { exact: true })).toBeChecked();
  await page.getByLabel("Name", { exact: true }).fill("Support bot");
  await page.getByLabel("What should this system help people do?").fill("Answer customer questions");
  await expect(page.getByText(/Nothing is sent to your system/)).toBeVisible();
  await page.getByRole("button", { name: "Create evaluation" }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/evaluations/${evaluationId}`));
  expect(requests).toEqual(["project", "evaluation", "target"]);
});
test("a new evaluation reuses a connected website without creating or checking another system", async ({ page }) => {
  const projectId = "00000000-0000-4000-8000-000000000040", evaluationId = "00000000-0000-4000-8000-000000000041", targetId = "00000000-0000-4000-8000-000000000042";
  const requests: string[] = [];
  await page.route("**/api/evals/v1/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/workspace/summary")) data = summaryFixture({ systems: [{ id: targetId, project_id: id, title: "Connected Maite", document: { kind: "website" }, connection_status: "ready", target_revision_id: id }] });
    if (request.method() === "POST") {
      requests.push(path);
      if (path.endsWith("/projects")) data = { id: projectId };
      else if (path.endsWith("/evaluations")) {
        expect(request.postDataJSON()).toMatchObject({ projectId, targetId });
        data = { id: evaluationId };
      } else throw new Error(`Unexpected new system request: ${path}`);
    }
    await route.fulfill({ json: { data, meta: {} } });
  });
  await page.goto(`/workspace/evaluations/new?orgId=${id}&editor`);
  await page.getByLabel("Name", { exact: true }).fill("Another Maite evaluation");
  await page.getByLabel("What should this system help people do?").fill("Answer our new questions");
  await page.getByLabel("Use a connected system").selectOption(targetId);
  await expect(page.getByLabel("Website URL")).toHaveCount(0);
  await page.getByRole("button", { name: "Create evaluation" }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/evaluations/${evaluationId}`));
  expect(requests).toEqual(["/api/evals/v1/projects", "/api/evals/v1/evaluations"]);
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
  await expect(page.getByRole("heading", { name: "Waiting for your answers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download question sheet" }).first()).toHaveAttribute("href", new RegExp(`/suites/${suiteVersionId}/candidate-template`));
  await page.getByLabel("Choose answer sheet").setInputFiles({ name: "answers.csv", mimeType: "text/csv", buffer: Buffer.from("suite_version_id,case_id,case_revision_id,input,system_answer\nsuite,case,revision,Question,Answer\n") });
  await page.getByRole("button", { name: "Upload answers" }).click();
  await expect(page.getByText("All answers matched. Your preliminary report is ready.")).toBeVisible();
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
  await expect(page.getByRole("link", { name: "Open report" })).toBeVisible();
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
  await page.route(`**/api/evals/v1/evaluations/${evaluationId}/generate?**`, (route) => route.fulfill({ json: { data: { status: "none", job: null }, meta: {} } }));
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
  await expect(page.getByRole("heading", { name: "Reference material" })).toBeVisible();
  await page.getByRole("button", { name: "Write a test yourself" }).click();
  await expect(page.getByLabel("Supporting excerpt")).toContainText("Refunds are accepted within 30 days.");
  await page.getByLabel("Question", { exact: true }).fill("When can I request a refund?");
  await page.getByLabel("Approved answer").fill("Within 30 days.");
  await page.getByLabel("Supporting excerpt").selectOption("00000000-0000-4000-8000-000000000016");
  await page.getByRole("button", { name: "Prepare this test" }).click();
  await expect(page.getByRole("heading", { name: "Review the test set" })).toBeVisible();
  await expect(page.getByText("When can I request a refund?")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Review the test set" })).toBeVisible();
  await expect(page.locator(".p-review-case").getByText("Within 30 days.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Approve test set/ }).click();
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
  // Extraction runs in the document worker; the page polls ingestion until it completes.
  await page.route(`**/api/evals/v1/sources/${sourceId}?**`, (route) => route.fulfill({ json: { data: { id: sourceId, revisions: finalized ? [{ id: revisionId }] : [], ingestion: finalized ? { status: "completed", source_revision_id: revisionId } : null, chunks: finalized ? [{ id: "00000000-0000-4000-8000-000000000025", excerpt: "Refunds are available within 30 days." }] : [] }, meta: {} } }));
  await page.goto(`/workspace/evaluations/${evaluationId}?orgId=${id}&editor`);
  await page.getByLabel("Choose documents").setInputFiles({ name: "refunds.txt", mimeType: "text/plain", buffer: Buffer.from("Refunds are available within 30 days.") });
  await page.getByRole("button", { name: "Add documents" }).click();
  await expect(page.getByRole("button", { name: "Write a test yourself" })).toBeVisible();
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
test("each result opens as its own full-width page and returns focus to the list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/workspace/reports/fixture");
  await page.getByRole("tab", { name: "Test results" }).click();
  // Rows lead with the question itself, so the customer reads what was asked.
  await page.getByRole("button", { name: /Can I get a refund\?/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Can I get a refund?" })).toBeFocused();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByText("30-day policy")).toBeVisible();
  await expect(page.getByText("No.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next result" })).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Can I get a refund\?/ })).toBeFocused();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: /Can I get a refund\?/ }).click();
  await expect(page.getByText("30-day policy")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "All results" }).click();
  await expect(page.getByRole("button", { name: /Can I get a refund\?/ })).toBeFocused();
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
  await page.goto("/ops/clients");
  await page.getByRole("button", { name: "New client", exact: true }).first().click();
  await page.getByLabel("Client name", { exact: true }).fill("Retry client");
  await page
    .getByRole("button", { name: "Create client", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page
    .getByRole("button", { name: "Create client", exact: true })
    .click();
  await expect(page.getByText("Client created: Retry client")).toBeVisible();
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
  // The bearer is kept in memory only; it is never shown or left in the URL.
  await expect(page.getByText(/Invitation link detected/)).toBeVisible();
  await expect(page.getByLabel("Invitation token")).toHaveCount(0);
  await expect(page).not.toHaveURL(/token=/);
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
  // The bearer is kept in memory only; it is never shown or left in the URL.
  await expect(page.getByText(/Invitation link detected/)).toBeVisible();
  await expect(page.getByLabel("Invitation token")).toHaveCount(0);
  await expect(page).not.toHaveURL(/token=/);
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
  // The bearer is kept in memory only; it is never shown or left in the URL.
  await expect(page.getByText(/Invitation link detected/)).toBeVisible();
  await expect(page.getByLabel("Invitation token")).toHaveCount(0);
  await expect(page).not.toHaveURL(/token=/);
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
  await page.goto(`/workspace/settings?owner=1&tab=monitoring`);
  await expect(page.getByRole("heading", { name: "Scheduled runs" }).first()).toBeVisible();
  await page.getByRole("button", { name: "New schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "New schedule" });
  await dialog.getByLabel("Cadence").selectOption("monthly");
  await dialog.getByLabel("Day of month").fill("31");
  await dialog.getByLabel("Time zone").fill("Europe/Madrid");
  await dialog.getByRole("button", { name: "Create schedule" }).click();
  await expect(page.getByText("Schedule created.")).toBeVisible();
  expect(created).toMatchObject({ orgId: id, evaluationId, targetRevisionId, suiteVersionId, cadence: "monthly", dayOfMonth: 31, timezone: "Europe/Madrid", maxRunSpend: "25", currency: "EUR" });

  // The schedule form is named, keyboard reachable and fits a phone.
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: "New schedule" }).click();
  const unnamed = await page.evaluate(() => [...document.querySelectorAll("[role=dialog] input, [role=dialog] select, [role=dialog] textarea, [role=dialog] button")]
    .filter((element) => {
      const control = element as HTMLInputElement;
      if (control.type === "hidden" || !control.checkVisibility()) return false;
      if (element.tagName === "BUTTON") return !(element.textContent?.trim() || element.getAttribute("aria-label"));
      return !(control.labels?.length || element.getAttribute("aria-label") || element.getAttribute("aria-labelledby"));
    }).map((element) => element.outerHTML.slice(0, 80)));
  expect(unnamed).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByLabel("Time zone").focus();
  let reached = false;
  for (let step = 0; step < 12 && !reached; step++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Create schedule");
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Escape");
  await page.goto(`/workspace/settings?owner=1&tab=developers`);
  for (const name of ["Add webhook", "Create token"]) await expect(page.getByRole("button", { name })).toBeVisible();
});

test("workspace can browse, fork, edit and freeze a test set", async ({ page }) => {
  const sourceSuiteId = "00000000-0000-4000-8000-000000000201";
  const sourceVersionId = "00000000-0000-4000-8000-000000000202";
  const forkSuiteId = "00000000-0000-4000-8000-000000000203";
  const oldRevisionId = "00000000-0000-4000-8000-000000000204";
  const newRevisionId = "00000000-0000-4000-8000-000000000205";
  let saved = false;
  let frozen = false;
  const originalDocument = {
    title: "Refund window",
    scenario: { messages: [{ role: "user", content: "How long do I have to request a refund?" }] },
    reference: { expected: "30 days" },
  };
  const updatedDocument = {
    ...originalDocument,
    title: "Updated refund window",
    scenario: { messages: [{ role: "user", content: "When does the refund period end?" }] },
    reference: { expected: "Thirty calendar days" },
  };
  const released = (suiteId: string, versionId: string, title: string) => ({
    suite_id: suiteId,
    title,
    project_id: "00000000-0000-4000-8000-000000000206",
    project_title: "Customer support",
    created_at: "2026-09-24T09:00:00.000Z",
    latest_version_id: versionId,
    frozen_at: "2026-09-24T10:00:00.000Z",
    case_count: 1,
    has_draft: false,
    version_count: 1,
    used_by: 0,
  });
  await page.route("**/api/evals/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/evals/v1/suites" && request.method() === "GET") {
      return route.fulfill({ json: { data: frozen ? [released(forkSuiteId, newRevisionId, "Support improvements"), released(sourceSuiteId, sourceVersionId, "Support source") ] : [released(sourceSuiteId, sourceVersionId, "Support source")], meta: {} } });
    }
    if (path === `/api/evals/v1/suites/${sourceSuiteId}/forks` && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ orgId: id, suiteVersionId: sourceVersionId, title: "Support improvements" });
      return route.fulfill({ json: { data: { suiteId: forkSuiteId, draftVersion: 1 }, meta: {} } });
    }
    if (path === `/api/evals/v1/suites/${forkSuiteId}/view` && request.method() === "GET") {
      const document = saved ? updatedDocument : originalDocument;
      const full = { ...document, severity: "high", provenance: { evidence_level: saved ? "customer_supplied_unreviewed" : "expert_reviewed" } };
      return route.fulfill({ json: { data: {
        suite: { id: forkSuiteId, title: "Support improvements", projectId: "00000000-0000-4000-8000-000000000206", createdAt: "2026-09-24T09:00:00.000Z" },
        draft: frozen ? null : { version: saved ? 2 : 1, caseCount: 1 },
        versions: frozen ? [{ id: newRevisionId, content_hash: "b".repeat(64), created_at: "2026-09-25T10:00:00.000Z", case_count: 1 }] : [],
        usedBy: [],
        selected: frozen ? newRevisionId : "draft",
        cases: [{ caseRevisionId: saved ? newRevisionId : oldRevisionId, document: full, excerpts: [{ sourceRevisionId: "s1", sourceTitle: "Refund policy", anchor: "a1", excerpt: "Refunds are available within 30 days." }] }],
      }, meta: {} } });
    }
    if (path === `/api/evals/v1/suites/${forkSuiteId}/cases/${oldRevisionId}` && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ orgId: id, title: "Updated refund window", contents: ["When does the refund period end?"], expected: "Thirty calendar days" });
      saved = true;
      return route.fulfill({ json: { data: { suiteId: forkSuiteId, version: 2, caseRevisionId: newRevisionId, contentHash: "b".repeat(64) }, meta: {} } });
    }
    if (path === `/api/evals/v1/suites/${forkSuiteId}/versions` && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ orgId: id, version: 2 });
      frozen = true;
      return route.fulfill({ json: { data: { id: newRevisionId }, meta: {} } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "NOT_FOUND", message: "Not found" } } });
  });

  await page.goto(`/workspace/test-sets?orgId=${id}&editor`);
  await expect(page.getByRole("heading", { name: "Test sets" })).toBeVisible();
  await expect(page.getByText("Support source", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^More actions: / }).first().click();
  await page.getByRole("menuitem", { name: "Make a copy" }).click();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Support improvements");
  await page.getByRole("button", { name: "Create copy" }).click();
  await expect(page).toHaveURL(new RegExp(`/workspace/test-sets/${forkSuiteId}`));
  await expect(page.getByRole("heading", { name: "Support improvements" })).toBeVisible();
  // Every question is readable with its expected answer and cited source.
  await expect(page.getByText("How long do I have to request a refund?")).toBeVisible();
  await expect(page.getByText("30 days", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Refund policy")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Updated refund window");
  await page.getByLabel("User message", { exact: true }).fill("When does the refund period end?");
  await page.getByLabel("Reference answer").fill("Thirty calendar days");
  await page.getByRole("button", { name: "Save test" }).click();
  await expect(page.getByText("Test saved. Review it before freezing.")).toBeVisible();
  await expect(page.getByText("When does the refund period end?")).toBeVisible();
  await page.getByRole("button", { name: "Freeze new version" }).click();
  await expect(page.getByText("Frozen", { exact: true }).first()).toBeVisible();
  expect(saved && frozen).toBe(true);
});

const actionOrg = "00000000-0000-4000-8000-000000000001";
const actionReport = "00000000-0000-4000-8000-000000000301";
function actionSnapshot(id: string, runId: string) {
  const now = new Date().toISOString();
  return {
    schema_version: "1.0", report_revision_id: id, run_id: runId, created_at: now, content_hash: "a".repeat(64),
    system: { name: "Support assistant", target_revision_id: "target-v1", purpose: "Support", execution_mode: "deployed_system" },
    scope: { suite_version_id: "suite-v1", evidence_policy: "source_grounded", started_at: now, finished_at: now, languages: ["en"], review_status: "preliminary" },
    metrics: { n_planned: 2, n_eligible: 2, n_executed: 2, n_scorable: 2, n_pass: 1, n_partial: 0, n_fail: 1, n_unscorable: 0, n_pending: 0, n_unresolved: 0, strict_pass_rate: 0.5, rubric_score: null, assessed_coverage: 1, execution_completion: 1, pass_bounds: null, wilson_interval: null, family_cluster_interval: null, critical_unassessed: 0, headline_status: "complete" },
    findings: [], improvements: [], takeaways: [{ text: "Refund answers omitted the 30-day window in 1 of 2 tests.", finding_ids: [], assessment_ids: ["a1"] }],
    results: [{ case_revision_id: "c1", title: "Refund window", topic: "refunds", severity: "high", outcome: "fail", assessment_id: "a1", observation_id: "o1", input: "Refund?", output: "No.", rationale: "Omitted policy.", source_refs: [], review_status: "unreviewed" }],
    methodology: { cef_version: "1.0", scorer_version: "v1", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "all", exclusions: [], review_coverage: "none", cost: null, limitations: [] },
  };
}

test("report actions publish a revision, share a previewed projection once and revoke it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const revisions = [
    { id: "00000000-0000-4000-8000-000000000311", run_id: "00000000-0000-4000-8000-000000000321", review_status: "preliminary", created_at: new Date().toISOString(), snapshot: actionSnapshot("00000000-0000-4000-8000-000000000311", "00000000-0000-4000-8000-000000000321") },
    { id: "00000000-0000-4000-8000-000000000312", run_id: "00000000-0000-4000-8000-000000000321", review_status: "preliminary", created_at: new Date(Date.now() - 60_000).toISOString(), snapshot: actionSnapshot("00000000-0000-4000-8000-000000000312", "00000000-0000-4000-8000-000000000321") },
  ];
  let current = revisions[1].id;
  const requests: string[] = [];
  let shares: Array<Record<string, unknown>> = [];
  await page.route(`**/api/evals/v1/reports/${actionReport}?**`, (route) => route.fulfill({ json: { data: { report: { current_revision_id: current, publication_status: "published" }, revisions }, meta: {} } }));
  await page.route(`**/api/evals/v1/reports/${actionReport}/publish`, (route) => { requests.push("publish"); current = route.request().postDataJSON().revisionId; return route.fulfill({ json: { data: { reportId: actionReport }, meta: {} } }); });
  await page.route(`**/api/evals/v1/reports/${actionReport}/shares**`, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: shares, meta: {} } });
    const body = route.request().postDataJSON();
    requests.push(`share:${body.permittedFields.join(",")}`);
    shares = [{ id: "00000000-0000-4000-8000-000000000331", report_revision_id: body.reportRevisionId, audience: body.audience, recipient: null, permitted_fields: body.permittedFields, expires_at: body.expiresAt, revoked_at: null, access_count: 0 }];
    return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000331", token: "tok_fixture" }, meta: {} } });
  });
  await page.route("**/api/evals/v1/shares/**", (route) => { requests.push("revoke"); shares = shares.map((item) => ({ ...item, revoked_at: new Date().toISOString() })); return route.fulfill({ json: { data: {}, meta: {} } }); });
  await page.route("**/api/evals/v1/runs?**", (route) => route.fulfill({ json: { data: [], meta: {} } }));
  await page.route(`**/api/evals/v1/reports/${actionReport}/narrative**`, (route) => route.fulfill({ json: { data: [], meta: {} } }));
  await page.route("**/api/evals/v1/exports", (route) => { requests.push("pdf"); return route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000341", status: "queued" }, meta: {} } }); });
  await page.route("**/api/evals/v1/exports/**", (route) => route.fulfill({ json: { data: { id: "00000000-0000-4000-8000-000000000341", status: "completed", download_path: "/api/evals/v1/report-artifacts/x" }, meta: {} } }));
  // The finished PDF downloads as an attachment, so the page stays put.
  await page.route("**/api/evals/v1/report-artifacts/**", (route) => route.fulfill({ body: "%PDF-1.7", headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="report.pdf"' } }));

  await page.goto(`/workspace/reports/actions?orgId=${actionOrg}&owner`);
  await expect(page.getByText("Refund answers omitted the 30-day window in 1 of 2 tests.")).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Revisions" }).click();
  await page.getByRole("dialog", { name: "Revisions" }).getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByText(/Revision published/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByText(/cannot be recalled/).first()).toBeVisible();
  await page.getByRole("menuitem", { name: "PDF document" }).click();
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Share" }).click();
  // Individual test results are opt-in: interaction excerpts are the most sensitive part.
  await expect(page.getByLabel("Individual test results with interaction excerpts")).not.toBeChecked();
  await page.getByRole("button", { name: "Preview shared view" }).click();
  const preview = page.getByRole("dialog", { name: "Shared view preview" });
  await expect(preview.getByText(/^Preview: this is exactly what recipients/)).toBeVisible();
  await expect(preview.getByRole("tab", { name: /Takeaways|Overview/ }).first()).toBeVisible();
  await expect(preview.getByRole("tab", { name: /Test results/ })).toHaveCount(0);
  await preview.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Create access" }).click();
  await expect(page.getByLabel("Private link")).toHaveValue(/share#token=tok_fixture/);
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText(/Access revoked/)).toBeVisible();
  expect(requests).toEqual(["publish", "pdf", "share:system,scope,metrics,takeaways,findings,improvements,methodology", "revoke"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("viewers see the report without delivery actions", async ({ page }) => {
  await page.route(`**/api/evals/v1/reports/${actionReport}?**`, (route) => route.fulfill({ json: { data: { report: { current_revision_id: "00000000-0000-4000-8000-000000000311", publication_status: "published" }, revisions: [{ id: "00000000-0000-4000-8000-000000000311", run_id: "r", review_status: "preliminary", created_at: new Date().toISOString(), snapshot: actionSnapshot("00000000-0000-4000-8000-000000000311", "r") }] }, meta: {} } }));
  await page.goto(`/workspace/reports/actions?orgId=${actionOrg}&viewer`);
  await expect(page.getByText("Refund answers omitted")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Report actions" })).toHaveCount(0);
});

test("result review queue records attributed decisions with a required reason", async ({ page }) => {
  let items = [{ assessment_id: "00000000-0000-4000-8000-000000000401", outcome: "partial", review_status: "needs_review", rationale: "1 criteria graded by the rubric judge.", criteria: [{ criterion_id: "grounding", score: null, rationale: "x" }], case_title: "Refund window", severity: "critical", question: "Can I get a refund?", answer: "Only within 30 days.", expected: "30-day refund window", source_refs: [], evaluation_title: "Support", judge_reason: null, judge_calibration: { examples: 3, agreement: 1, adequate: false } }];
  const decisions: unknown[] = [];
  await page.route("**/api/evals/v1/workspaces", (route) => route.fulfill({ json: { data: [{ id: actionOrg, name: "Example client" }], meta: {} } }));
  await page.route("**/api/evals/v1/reviews**", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: items, meta: {} } });
    decisions.push(route.request().postDataJSON()); items = [];
    return route.fulfill({ json: { data: {}, meta: {} } });
  });
  await page.goto("/ops/review");
  // Queue rows lead with the question that was asked.
  await page.getByRole("button", { name: "Can I get a refund?" }).click();
  await expect(page.getByRole("heading", { name: "Refund window" })).toBeVisible();
  await expect(page.getByText(/experimental/)).toBeVisible();
  await page.getByLabel("Override with a new outcome").check();
  await page.getByLabel("Outcome for an override").selectOption("pass");
  await page.getByLabel(/Reason/).fill("The answer states the documented window.");
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Decision recorded.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "No results need review" })).toBeVisible();
  expect(decisions).toEqual([{ orgId: actionOrg, assessmentId: "00000000-0000-4000-8000-000000000401", decision: "override", reason: "The answer states the documented window.", outcome: "pass", criteria: [{ criterion_id: "grounding", score: 1, rationale: "The answer states the documented window." }] }]);
});

test("platform console hides endpoints and keys and confirms identity in place on sensitive changes", async ({ page }) => {
  const posted: unknown[] = [];
  await page.route("**/api/evals/v1/workspaces", (route) => route.fulfill({ json: { data: [{ id: actionOrg, name: "Example client" }], meta: {} } }));
  await page.route("**/api/evals/v1/providers?**", (route) => route.fulfill({ json: { data: {
    accounts: [{ id: "00000000-0000-4000-8000-000000000501", name: "Local DGX", currency: "EUR", ceiling: "100", settled: "0", reserved: "0", enabled: true }],
    revisions: [{ id: "00000000-0000-4000-8000-000000000502", account_id: "00000000-0000-4000-8000-000000000501", adapter: "dgx", model_id: "llama3.1:8b", roles: ["generator", "judge"], capabilities: { text: true, jsonObject: true }, context_limit: 8192, output_limit: 1024, data_classes: ["synthetic"], regions: ["private_wireguard"], endpoint_host: "private DGX route", health: "healthy", last_probe_at: null, retired_at: null, price: { id: "p", currency: "EUR", input: "0", output: "0" } }],
    secrets: [],
  }, meta: {} } }));
  await page.route("**/api/evals/v1/models/routes", (route) => route.fulfill({ json: { data: [{ org_id: actionOrg, workspace: "Example client", role: "judge", provider_revision_id: "00000000-0000-4000-8000-000000000502", price_revision_id: "p", data_class: "synthetic", region: "private_wireguard", internal_cost_per_second: "0.0001", updated_at: new Date().toISOString() }], meta: {} } }));
  await page.route("**/api/evals/v1/budgets/**", (route) => { posted.push(route.request().postDataJSON()); return route.fulfill({ status: 403, json: { error: { code: "REAUTHENTICATION_REQUIRED", message: "Confirm it is you to make this platform change.", field_errors: [], request_id: "r", retryable: false } } }); });
  await page.goto("/ops/platform");
  await expect(page.getByRole("rowheader", { name: /llama3\.1:8b/ })).toBeVisible();
  await expect(page.getByText(/private DGX route/).first()).toBeVisible();
  await expect(page.getByText(/192\.168|11434/)).toHaveCount(0);
  await page.getByRole("button", { name: "Amend" }).first().click();
  await page.getByRole("dialog").getByLabel("Reason").fill("Pause for rotation");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  // The session is fine: the person confirms with their password instead of being signed out.
  const confirm = page.getByRole("dialog", { name: "Confirm it’s you" });
  await expect(confirm.getByLabel("Password")).toBeVisible();
  await expect(page.getByText(/session has expired/i)).toHaveCount(0);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Confirm it’s you to make this platform change.")).toBeVisible();
  expect(posted).toEqual([expect.objectContaining({ targetKind: "provider_account", reason: "Pause for rotation", enabled: true })]);
  await page.goto("/ops/platform?readonly");
  await expect(page.getByText(/Changes need a platform administrator/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Register/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Amend" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("usage amendments require a reason and send the entitlement change", async ({ page }) => {
  const posted: Array<Record<string, unknown>> = [];
  await page.route("**/api/evals/v1/workspaces", (route) => route.fulfill({ json: { data: [{ id: actionOrg, name: "Example client" }], meta: {} } }));
  await page.route("**/api/evals/v1/usage?**", (route) => route.fulfill({ json: { data: {
    budgets: [{ id: "b", kind: "workspace", scope_id: actionOrg, currency: "EUR", ceiling: "500", settled: "12.5", reserved: "1" }],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website", "imported_responses"], can_schedule: false, can_export: true, review_allowance: 0, version: 1 },
    evaluations: [], amendments: [], targetCalls: { calls: 3, unknown: 0 },
  }, meta: {} } }));
  await page.route("**/api/evals/v1/budgets/**", (route) => { posted.push(route.request().postDataJSON()); return route.fulfill({ json: { data: { amendmentId: "x" }, meta: {} } }); });
  await page.goto("/ops/platform/usage");
  await page.getByRole("button", { name: "Amend entitlements" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Scheduled monitoring").check();
  await dialog.getByLabel("Active run allowance").fill("3");
  await dialog.getByLabel("Reason").fill("Monitoring subscription signed");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Amendment recorded/)).toBeVisible();
  expect(posted[0]).toMatchObject({ targetKind: "entitlement", canSchedule: true, maxActiveRuns: 3, reason: "Monitoring subscription signed", allowedConnectionTypes: ["website", "imported_responses"] });
});

test("domain packs list their rubric, evaluators and prohibited assumptions", async ({ page }) => {
  await page.route("**/api/evals/v1/domain-packs", (route) => route.fulfill({ json: { data: [{ id: "generic-grounded-qa", version: "1", title: "Generic grounded Q&A", status: "active", summary: "Grounded questions.", taskTypes: ["grounded_qa"], requiredContext: ["purpose"], sourceHierarchy: ["customer policy"], rubricCriteria: [{ id: "correctness", description: "Correct." }], deterministicEvaluators: ["claims"], prohibitedAssumptions: ["Remembered laws"], reviewGuidelines: "Review critical cases." }], meta: {} } }));
  await page.goto("/ops/library/domain-packs");
  await page.getByRole("button", { name: /Generic grounded Q&A/ }).click();
  await expect(page.getByRole("heading", { name: "Generic grounded Q&A" })).toBeVisible();
  await expect(page.getByText("Remembered laws")).toBeVisible();
});

test("AI model settings turn web research on per task and connect a search engine for every model", async ({ page }) => {
  const now = new Date().toISOString();
  const route = (role: string, web: boolean) => ({ role, provider_revision_id: `rev-${role}`, model_id: "qwen3-coder:30b", adapter: "dgx", account_id: "dgx", account_name: "DGX Spark", context_limit: 131072, input_price: "0", output_price: "0", currency: "EUR", updated_at: now, usable: true, web_research: web, web_capable: true });
  let engines: Array<Record<string, unknown>> = [];
  const web: unknown[] = [], keys: unknown[] = [];
  await page.route("**/api/evals/v1/engine?**", (request) => request.fulfill({ json: { data: {
    roles: ["context_analyzer", "generator", "judge", "report_writer"], dgxAvailable: true,
    connections: [{ id: "dgx", name: "DGX Spark", adapter: "dgx", host: "DGX Spark (private network)", key_hint: null, enabled: true, has_key: false }],
    platform: [route("context_analyzer", false), route("generator", false), route("judge", web.length > 0), route("report_writer", false)],
    workspace: [], searchEngines: engines,
  }, meta: {} } }));
  await page.route("**/api/evals/v1/engine/routes/web", (request) => { web.push(request.request().postDataJSON()); return request.fulfill({ json: { data: { ok: true }, meta: {} } }); });
  await page.route("**/api/evals/v1/engine/web-search", (request) => {
    keys.push(request.request().postDataJSON());
    engines = [{ engine: "tavily", key_hint: "…ab12", priority: 1, enabled: true, updated_at: now }];
    return request.fulfill({ json: { data: { engine: "tavily" }, meta: {} } });
  });
  await page.goto("/workspace/settings/models");
  const research = page.getByRole("region").filter({ has: page.getByRole("heading", { name: "Web research" }) }).or(page.locator("section", { has: page.getByRole("heading", { name: "Web research" }) }));
  await expect(page.getByText(/No search engine is connected/)).toBeVisible();
  await page.getByRole("row", { name: /Tavily/ }).getByRole("button", { name: "Connect" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect Tavily" });
  await dialog.getByLabel("API key").fill("tvly-test-key-0001");
  await dialog.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByRole("row", { name: /Tavily/ }).getByText("Primary")).toBeVisible();
  await expect(page.getByText(/No search engine is connected/)).toHaveCount(0);
  expect(keys).toEqual([expect.objectContaining({ engine: "tavily", apiKey: "tvly-test-key-0001" })]);
  // The key never comes back to the page.
  await expect(page.getByText("tvly-test-key-0001")).toHaveCount(0);
  // The switch reflects the saved setting, so it turns on once the server confirms.
  await research.getByRole("switch", { name: "Grade answers" }).click();
  await expect(research.getByRole("switch", { name: "Grade answers" })).toBeChecked();
  expect(web).toEqual([expect.objectContaining({ scope: "platform", role: "judge", enabled: true })]);
  await expect(research.getByText("Searches with Tavily")).toBeVisible();
  await expect(page.getByRole("row", { name: /Grade answers/ }).getByText("Web", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("queued evaluations explain automatic start and change to execution after polling", async ({ page }) => {
  const evaluationId = evaluationFixture.id, runId = "00000000-0000-4000-8000-000000000901";
  let status = "queued";
  await page.route("**/api/evals/v1/workspace/summary?**", route => route.fulfill({ json: { data: summaryFixture({ evaluations: [{ ...evaluationFixture, latest_run_id: runId, latest_run_status: status }] }), meta: {} } }));
  await page.route(`**/api/evals/v1/runs/${runId}?**`, route => route.fulfill({ json: { data: { run: { id: runId, status, phase: status === "queued" ? "preflight" : "target_execution", execution_mode: "deployed_system", suite_version_id: evaluationFixture.selected_suite_version_id, created_at: new Date().toISOString(), reason_code: null }, units: [{ id: "unit", status: "queued" }], targetUsage: { calls: 0, unknown: 0 } }, meta: {} } }));
  await page.goto(`/workspace/evaluations/${evaluationId}?orgId=${id}&editor`);
  await expect(page.getByRole("heading", { name: "Evaluation queued" })).toBeVisible();
  await expect(page.locator(".p-badge").getByText("Queued", { exact: true })).toBeVisible();
  await expect(page.getByText("Your evaluation will start automatically when a run slot is available.", { exact: false })).toBeVisible();
  await page.screenshot({ path: "/tmp/evaluation-run-queue-ui.png", fullPage: true });
  status = "running";
  await expect(page.getByRole("heading", { name: "Asking the system", exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("heading", { name: "Evaluation queued" })).toHaveCount(0);
});
