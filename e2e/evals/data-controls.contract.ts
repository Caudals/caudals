/**
 * UI contracts for data controls (launch L-32, spec P-44 and the P-42
 * follow-up): Settings → Data (answer retention, "Export all workspace data"),
 * the Danger zone's consequences and the countersigned DPA copy, at 390, 768
 * and 1440 px, in English and Spanish. Runs against the isolated harness
 * (ui.config.ts); `?data-controls` stands for DATA_CONTROLS_ENABLED=true and
 * the API is routed per test.
 */
import { expect, test, type Page } from "@playwright/test";

const WIDTHS = [390, 768, 1440] as const;
const ORG = "00000000-0000-4000-8000-000000000001";
const VERSION = "2026-10-11";

function summary() {
  return {
    evaluations: [], systems: [], reports: [],
    entitlement: { max_active_runs: 1, monthly_spend_limit: "500", currency: "EUR", allowed_connection_types: ["website"], can_export: true, can_schedule: true },
    usage: { settled: "0", outstanding: "0" },
    preferences: { completion: true, required_input: true, failure: true, email: false },
  };
}
type ExportView = { id: string; status: string; requestedAt: string; completedAt: string | null; expiresAt: string | null; byteSize: number | null; fileName: string | null; reasonCode: string | null; counts: Record<string, number> | null; downloadPath: string | null };
type State = {
  owner: boolean;
  retention: 30 | 90 | 365 | null;
  due?: number;
  exports: ExportView[];
  polls: number;
  failure?: string;
  dpa?: { canAttach: boolean; countersigned: boolean; acceptance: boolean };
};
const queued = (): ExportView => ({ id: "export-1", status: "queued", requestedAt: new Date().toISOString(), completedAt: null, expiresAt: null, byteSize: null, fileName: null, reasonCode: null, counts: null, downloadPath: null });
const ready = (): ExportView => ({
  ...queued(), status: "completed", completedAt: new Date().toISOString(), expiresAt: "2026-10-21T12:00:00.000Z", byteSize: 2.3 * 1024 * 1024,
  fileName: "Caudals-workspace-export-example-client-2026-10-14.zip", counts: { reports: 12, runs: 40, observations: 1820 },
  downloadPath: `/api/evals/v1/exports/workspace/export-1/download?orgId=${ORG}`,
});

async function routeApi(page: Page, state: State) {
  const calls: Array<{ method: string; path: string; body: unknown; type?: string }> = [];
  await page.route("**/api/evals/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method !== "GET") calls.push({ method, path: url.pathname + url.search, body: request.headers()["content-type"]?.startsWith("application/json") ? request.postDataJSON() : null, type: request.headers()["content-type"] });
    if (url.pathname.endsWith("/workspace/summary")) return route.fulfill({ json: { data: summary(), meta: {} } });
    if (url.pathname === `/api/evals/v1/workspaces/${ORG}/retention`) {
      if (method === "PUT") state.retention = (request.postDataJSON() as { observationDays: State["retention"] }).observationDays;
      const preview = url.searchParams.get("preview");
      return route.fulfill({ json: { data: {
        observationDays: state.retention, version: state.retention ? 1 : 0, updatedAt: state.retention ? "2026-10-14T10:00:00.000Z" : null, canChange: state.owner,
        preview: preview ? { days: Number(preview), due: state.due ?? 12345, pinned: 56, purged: 0 } : null,
      }, meta: {} } });
    }
    if (url.pathname === "/api/evals/v1/exports/workspace") {
      if (method === "POST") {
        state.exports = [queued()];
        state.polls = 0;
        return route.fulfill({ json: { data: state.exports[0], meta: {} } });
      }
      if (state.exports[0]?.status === "queued" && ++state.polls >= 1) state.exports = [state.failure ? { ...queued(), status: "failed", reasonCode: state.failure } : ready()];
      return route.fulfill({ json: { data: state.exports, meta: {} } });
    }
    if (url.pathname === "/api/evals/v1/exports/workspace/export-1") {
      state.exports = [];
      return route.fulfill({ json: { data: { id: "export-1", status: "deleted" }, meta: {} } });
    }
    if (url.pathname === `/api/evals/v1/workspaces/${ORG}/deletion`) return route.fulfill({ json: { data: null, meta: {} } });
    if (url.pathname.startsWith(`/api/evals/v1/workspaces/${ORG}/dpa`)) {
      const dpa = state.dpa ?? { canAttach: false, countersigned: false, acceptance: true };
      if (url.pathname.endsWith("/countersigned") && method === "POST") dpa.countersigned = true;
      if (url.pathname.includes("/countersigned/") && method === "DELETE") dpa.countersigned = false;
      state.dpa = dpa;
      return route.fulfill({ json: { data: {
        document: "dpa", currentVersion: VERSION, canAccept: state.owner, you: { name: "Test operator", email: "operator@example.test" },
        acceptance: dpa.acceptance ? { id: "acceptance-1", version: VERSION, acceptedAt: "2026-10-12T10:00:00.000Z", locale: "en", current: true, signer: null } : null,
        countersigned: dpa.countersigned ? { id: "cs-1", acceptanceId: "acceptance-1", version: VERSION, fileName: "signed.pdf", byteSize: 2048, uploadedAt: "2026-10-13T10:00:00.000Z" } : null,
        canAttach: dpa.canAttach,
      }, meta: {} } });
    }
    return route.fulfill({ json: { data: [], meta: {} } });
  });
  return calls;
}
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const spanish = (page: Page) => page.addInitScript(() => { (window as unknown as { __CAUDALS_LOCALE: string }).__CAUDALS_LOCALE = "es"; });

for (const width of WIDTHS) {
  test(`an owner sets answer retention and exports the workspace at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const calls = await routeApi(page, { owner: true, retention: null, exports: [], polls: 0 });
    await page.goto("/workspace/settings?owner&data-controls&tab=data");
    await expect(page.getByRole("tab", { name: "Data" })).toHaveAttribute("aria-selected", "true");
    const retention = page.locator("#retention");
    await expect(retention.getByRole("heading", { name: "Answer retention" })).toBeVisible();
    await expect(retention.getByText("Answers are kept until you delete them.")).toBeVisible();
    const select = retention.getByLabel("Keep answers for");
    await expect(select).toHaveValue("keep");
    await expect(retention.getByRole("button", { name: "Save retention" })).toBeDisabled();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l32-data-${width}-before.png`, fullPage: width !== 1440 });

    await select.selectOption("30");
    await retention.getByRole("button", { name: "Save retention" }).click();
    const dialog = page.getByRole("dialog", { name: "Keep answers for 30 days?" });
    await expect(dialog.getByText("12,345 answers are older than 30 days and will be removed within the next hour.")).toBeVisible();
    await expect(dialog.getByText("56 older answers stay because reports you keep use them.")).toBeVisible();
    await expect(dialog.getByText("Removed answers can't be recovered. Reports keep their own copy of the answers they show.")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await expect(dialog).toHaveCSS("opacity", "1");
    await page.waitForTimeout(250);
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l32-retention-${width}-dialog.png` });
    await dialog.getByRole("button", { name: "Keep 30 days" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Retention saved.")).toBeVisible();
    await expect(retention.getByText("Answers older than 30 days are removed every day, except those behind reports you keep.")).toBeVisible();
    expect(calls.filter((call) => call.method === "PUT")).toEqual([{ method: "PUT", path: `/api/evals/v1/workspaces/${ORG}/retention`, body: { observationDays: 30 }, type: "application/json" }]);

    // Back to keeping everything: nothing is removed, so no confirmation.
    await select.selectOption("keep");
    await retention.getByRole("button", { name: "Save retention" }).click();
    await expect(retention.getByText("Answers are kept until you delete them.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const exportRow = page.locator("#export");
    await expect(exportRow.getByRole("heading", { name: "Export all workspace data" })).toBeVisible();
    await expect(exportRow.getByText(/The download works for 7 days\./)).toBeVisible();
    await exportRow.getByRole("button", { name: "Prepare export" }).click();
    await expect(page.getByText("Export started.")).toBeVisible();
    await expect(exportRow.getByText(/^Ready: 2\.3 MB, available until /)).toBeVisible({ timeout: 10_000 });
    await expect(exportRow.getByText("Reports: 12 · Test runs: 40 · Answers: 1,820")).toBeVisible();
    await expect(exportRow.getByRole("link", { name: "Download ZIP" })).toHaveAttribute("href", `/api/evals/v1/exports/workspace/export-1/download?orgId=${ORG}`);
    expect(await noHorizontalScroll(page)).toBe(true);
    if (width !== 1440) await exportRow.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l32-data-${width}-ready.png`, fullPage: width !== 1440 });
    await exportRow.getByRole("button", { name: "Delete export" }).click();
    await expect(page.getByText("Export deleted.")).toBeVisible();
    await expect(exportRow.getByRole("button", { name: "Prepare export" })).toBeVisible();
    expect(calls.filter((call) => call.path.includes("/exports/")).map((call) => [call.method, call.path])).toEqual([
      ["POST", "/api/evals/v1/exports/workspace"],
      ["DELETE", `/api/evals/v1/exports/workspace/export-1?orgId=${ORG}`],
    ]);
  });
}

test("members who are not owners see the settings without the actions", async ({ page }) => {
  await routeApi(page, { owner: false, retention: 90, exports: [], polls: 0 });
  await page.goto("/workspace/settings?viewer&data-controls&tab=data");
  const retention = page.locator("#retention");
  await expect(retention.getByText("Answers older than 90 days are removed every day, except those behind reports you keep.")).toBeVisible();
  await expect(retention.getByText("Only an owner can change this.")).toBeVisible();
  await expect(retention.getByText("90 days", { exact: true })).toBeVisible();
  await expect(retention.getByLabel("Keep answers for")).toHaveCount(0);
  await expect(page.locator("#export").getByText("Only an owner can export workspace data.")).toBeVisible();
  await expect(page.locator("#export").getByRole("button")).toHaveCount(0);
});

test("a failed export says why and offers a new one", async ({ page }) => {
  await routeApi(page, { owner: true, retention: null, exports: [], polls: 0, failure: "export_too_large" });
  await page.goto("/workspace/settings?owner&data-controls&tab=data");
  const exportRow = page.locator("#export");
  await exportRow.getByRole("button", { name: "Prepare export" }).click();
  await expect(exportRow.getByText("This workspace is too large to export here. Write to privacy@caudals.com and we will prepare the export for you.")).toBeVisible({ timeout: 10_000 });
  await expect(exportRow.getByRole("button", { name: "Prepare a new export" })).toBeVisible();
});

test("the Danger zone spells out what deletion does, and points to the export when it exists", async ({ page }) => {
  await routeApi(page, { owner: true, retention: null, exports: [], polls: 0 });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/workspace/settings?owner&data-controls&tab=danger");
  const row = page.locator("#delete-workspace");
  await expect(row.getByText("What happens when you delete this workspace:")).toBeVisible();
  await expect(row.getByRole("listitem")).toHaveCount(7);
  await expect(row.getByText("Every member loses access at once, and every share link stops working.")).toBeVisible();
  await expect(row.getByText("Stored files (uploaded documents, report PDF and Word files, exports) are deleted within minutes.")).toBeVisible();
  await expect(row.getByText(/To have every remaining record erased, write to privacy@caudals\.com\./)).toBeVisible();
  await expect(row.getByText("To keep a copy, export your data first in the Data tab.")).toBeVisible();
  await expect(row.getByRole("button", { name: "Delete workspace data" })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
  await page.screenshot({ path: "/tmp/evals-ui-test-results/l32-danger-390.png", fullPage: true });

  // With the flag off: no Data tab and no pointer to it; the consequences stay.
  await page.goto("/workspace/settings?owner&tab=danger");
  await expect(page.getByRole("tab", { name: "Data" })).toHaveCount(0);
  await expect(page.locator("#delete-workspace").getByRole("listitem")).toHaveCount(7);
  await expect(page.locator("#delete-workspace").getByText("To keep a copy, export your data first in the Data tab.")).toHaveCount(0);
});

test("owners download the countersigned DPA; operations attach and remove it", async ({ page }) => {
  const state: State = { owner: true, retention: null, exports: [], polls: 0, dpa: { canAttach: false, countersigned: true, acceptance: true } };
  const calls = await routeApi(page, state);
  await page.goto("/workspace/settings?owner");
  const dpa = page.locator("#dpa");
  await expect(dpa.getByText(`Countersigned copy of version ${VERSION}, attached on October 13, 2026.`)).toBeVisible();
  await expect(dpa.getByRole("link", { name: "Download countersigned copy (PDF)" })).toHaveAttribute("href", `/api/evals/v1/workspaces/${ORG}/dpa/countersigned/cs-1`);
  await expect(dpa.getByRole("button", { name: "Attach countersigned PDF" })).toHaveCount(0);
  await expect(dpa.getByRole("button", { name: "Remove copy" })).toHaveCount(0);

  state.dpa = { canAttach: true, countersigned: false, acceptance: true };
  await page.goto("/workspace/settings?admin");
  await expect(dpa.getByText(/Caudals operations: attach the PDF signed by both parties/)).toBeVisible();
  await dpa.locator('input[type="file"]').setInputFiles({ name: "signed.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 fixture") });
  await expect(page.getByText("Countersigned copy attached.")).toBeVisible();
  await expect(dpa.getByRole("button", { name: "Remove copy" })).toBeVisible();
  expect(calls.find((call) => call.method === "POST")).toMatchObject({ path: `/api/evals/v1/workspaces/${ORG}/dpa/countersigned?acceptanceId=acceptance-1&fileName=signed.pdf`, type: "application/pdf" });
  await dpa.getByRole("button", { name: "Remove copy" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove the countersigned copy?" });
  await expect(dialog.getByText("The stored PDF is deleted. The record of the upload and your reason stay in the audit log.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove copy" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("Uploaded the unsigned draft");
  await dialog.getByRole("button", { name: "Remove copy" }).click();
  await expect(page.getByText("Countersigned copy removed.")).toBeVisible();
  expect(calls.find((call) => call.method === "DELETE")).toMatchObject({ path: `/api/evals/v1/workspaces/${ORG}/dpa/countersigned/cs-1`, body: { reason: "Uploaded the unsigned draft" } });
  await expect(dpa.getByRole("button", { name: "Attach countersigned PDF" })).toBeVisible();
});

for (const width of [390, 1440] as const) {
  test(`Settings → Data reads in Spanish at ${width}px`, async ({ page }) => {
    await spanish(page);
    await page.setViewportSize({ width, height: 900 });
    await routeApi(page, { owner: true, retention: null, exports: [], polls: 0 });
    await page.goto("/workspace/settings?owner&data-controls&tab=data");
    await expect(page.getByRole("tab", { name: "Datos" })).toHaveAttribute("aria-selected", "true");
    const retention = page.locator("#retention");
    await expect(retention.getByRole("heading", { name: "Conservación de las respuestas" })).toBeVisible();
    await expect(retention.getByText("Las respuestas se conservan hasta que las elimines.")).toBeVisible();
    await retention.getByLabel("Conservar las respuestas").selectOption("90");
    await retention.getByRole("button", { name: "Guardar la conservación" }).click();
    const dialog = page.getByRole("dialog", { name: "¿Conservar las respuestas 90 días?" });
    await expect(dialog.getByText("Hay 12.345 respuestas de más de 90 días, que se eliminarán en la próxima hora.")).toBeVisible();
    await expect(dialog.getByText("56 respuestas antiguas se conservan porque las usan informes que conservas.")).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await dialog.getByRole("button", { name: "Conservar 90 días" }).click();
    await expect(page.getByText("Conservación guardada.")).toBeVisible();
    const exportRow = page.locator("#export");
    await expect(exportRow.getByRole("heading", { name: "Exportar todos los datos del espacio" })).toBeVisible();
    await exportRow.getByRole("button", { name: "Preparar la exportación" }).click();
    await expect(exportRow.getByText(/^Lista: 2,3 MB, disponible hasta el /)).toBeVisible({ timeout: 10_000 });
    await expect(exportRow.getByRole("link", { name: "Descargar el ZIP" })).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.screenshot({ path: `/tmp/evals-ui-test-results/l32-data-${width}-es.png`, fullPage: true });
    await page.goto("/workspace/settings?owner&data-controls&tab=danger");
    await expect(page.locator("#delete-workspace").getByText("Qué ocurre al eliminar este espacio:")).toBeVisible();
    await expect(page.locator("#delete-workspace").getByText("Para conservar una copia, exporta antes tus datos en la pestaña Datos.")).toBeVisible();
  });
}
