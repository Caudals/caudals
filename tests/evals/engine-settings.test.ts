import { describe, expect, it, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { buildReportSnapshot } from "../../lib/evals/reports/contracts";
import { aggregateRun } from "../../lib/evals/scoring/aggregate";
import { renderReportDocx } from "../../lib/evals/reports/docx";
import { fitMaterial } from "../../lib/evals/repositories/automatic-generation";
import { materialBudgetBytes, routingFor, internalTimeoutMs } from "../../lib/evals/repositories/model-routes";
import { evalRequest } from "../../components/evals/api";

afterEach(() => vi.unstubAllGlobals());

function snapshot() {
  const now = new Date().toISOString();
  const results = [0, 1].map((index) => ({
    case_revision_id: randomUUID(), title: `Case ${index}`, topic: "fees", severity: "high" as const,
    outcome: index ? "fail" as const : "pass" as const, assessment_id: `a${index}`, observation_id: randomUUID(),
    input: "What is the fee?\nPlease answer.", output: index ? "No idea \u0007" : "It is 2%.", rationale: "Compared with the policy.", source_refs: [], review_status: "unreviewed",
  }));
  return buildReportSnapshot({
    schema_version: "1.0", report_revision_id: randomUUID(), run_id: randomUUID(), created_at: now,
    system: { name: "Synthetic assistant", target_revision_id: randomUUID(), purpose: "Fixture", execution_mode: "deployed_system" },
    scope: { suite_version_id: randomUUID(), evidence_policy: "source_grounded", started_at: now, finished_at: now, languages: ["en"], review_status: "preliminary" },
    metrics: aggregateRun(results.map((result, index) => ({ id: result.case_revision_id, familyId: `f${index}`, eligible: true, executionStatus: "succeeded", outcome: result.outcome, severity: "high" }))),
    findings: [{ id: "f1", title: "Fee answers missing", severity: "high", evidence_strength: "observed", frequency_n: 1, frequency_denominator: 2,
      observation: "One fee answer was missing.", cause_hypothesis: null, recommendation: "Add the fee table.", assessment_ids: ["a1"] }],
    results, improvements: [],
    methodology: { cef_version: "1.0", scorer_version: "v1", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "all", exclusions: [], review_coverage: "none", cost: null, limitations: [] },
  });
}

describe("report Word export", () => {
  it("renders a valid .docx with the report sections and strips control characters", async () => {
    const bytes = await renderReportDocx(snapshot());
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
    for (const text of ["Synthetic assistant", "Results at a glance", "Findings", "Fee answers missing", "Interaction evidence", "Methodology and limitations"]) expect(xml).toContain(text);
    expect(xml).not.toContain("\u0007");
  });
});

describe("model routing and context fitting", () => {
  it("keeps DGX work local and sends commercial work only to the chosen revision", () => {
    expect(routingFor({ adapter: "dgx", provider_revision_id: "p" })).toEqual({ routing: "local_only", approvedProviderIds: [] });
    expect(routingFor({ adapter: "openai_compatible", provider_revision_id: "p" })).toEqual({ routing: "approved_providers", approvedProviderIds: ["p"] });
    expect(internalTimeoutMs({ adapter: "dgx" }, 900_000)).toBe(900_000);
    expect(internalTimeoutMs({ adapter: "openai_compatible" }, 900_000)).toBe(300_000);
    expect(internalTimeoutMs({ adapter: "openai_compatible" }, 900_000, 900_000)).toBe(900_000);
  });

  it("fits excerpts round-robin across sources within the model budget", () => {
    const excerpt = "x".repeat(1000);
    const material = [
      { sourceRevisionId: "website", anchors: Array.from({ length: 20 }, (_, index) => ({ anchorId: `w${index}`, excerpt })) },
      { sourceRevisionId: "policy", anchors: [{ anchorId: "p0", excerpt }, { anchorId: "p1", excerpt }] },
    ];
    const fitted = fitMaterial(material, 5_000);
    const ids = fitted.flatMap((source) => source.anchors.map((anchor) => anchor.anchorId));
    expect(ids).toEqual(expect.arrayContaining(["w0", "p0", "w1", "p1"]));
    expect(Buffer.byteLength(JSON.stringify(fitted))).toBeLessThanOrEqual(5_200);
    expect(() => fitMaterial(material, 50)).toThrow(/context window/);
    expect(materialBudgetBytes({ context_limit: 8192, output_limit: 4096, tpm: 8192 }, 4096, 2000)).toBe(8192 - 4096 - 1024 - 2000 - 512);
    expect(materialBudgetBytes({ context_limit: 1_000_000, output_limit: 8192, tpm: 1_000_000 }, 4096, 0)).toBe(200_000);
  });
});

describe("configuration errors reach the person", () => {
  it("shows the curated message for a missing model instead of a bare reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "PROVIDER_UNAVAILABLE", message: "No model is set up for test generation.", request_id: "r-1" } }, { status: 503 })));
    await expect(evalRequest("/evaluations/x/generate", "POST", {})).rejects.toThrow("No model is set up for test generation.");
  });
});

describe("Spanish interface and exports", () => {
  it("explains an unknown generation outcome without promising an automatic retry", async () => {
    const { setLocale } = await import("../../lib/evals/messages/en");
    const { generationStopMessage } = await import("../../components/evals/workspace-preparation");
    setLocale("en");
    expect(generationStopMessage("network_unavailable")).toMatch(/may have run/);
    setLocale("es");
    expect(generationStopMessage("network_unavailable")).toMatch(/Puede que el intento se haya ejecutado/);
    setLocale("en");
  });

  it("translates interface strings, keeps English as the fallback and localizes generated report text", async () => {
    const { t, setLocale } = await import("../../lib/evals/messages/en");
    const { localizeReportText } = await import("../../lib/evals/reports/i18n");
    expect(t("generateTestSet", "es")).toBe("Generar conjunto de pruebas");
    setLocale("es");
    expect(t("settings")).toBe("Ajustes");
    setLocale("en");
    expect(t("settings")).toBe("Settings");
    expect(localizeReportText("3 assessed results showed criterion failure.", "es")).toBe("3 resultados evaluados mostraron incumplimiento de criterios.");
    expect(localizeReportText("Refunds failures: 2 of 5 relevant assessed results.", "es")).toBe("Fallos en Refunds: 2 de 5 resultados evaluados relevantes.");
    expect(localizeReportText("A customer wrote this.", "es")).toBe("A customer wrote this.");
  });

  it("renders the PDF document and the Word report in Spanish", async () => {
    const { renderReportDocument } = await import("../../lib/evals/reports/document");
    const html = renderReportDocument(snapshot(), "es");
    expect(html).toContain('lang="es"');
    expect(html).toContain("Informe de evaluación");
    expect(html).toContain("Tasa de acierto estricta");
    expect(html).toContain("What is the fee?"); // recorded content keeps its words
    expect(renderReportDocument(snapshot())).toContain("Evaluation report");
    const xml = await (await JSZip.loadAsync(await renderReportDocx(snapshot(), "es"))).file("word/document.xml")!.async("string");
    expect(xml).toContain("Resultados de un vistazo");
    expect(xml).toContain("Evidencia de las interacciones");
  });
});
