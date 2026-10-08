import { reportSnapshotSchema, type ReportSnapshot } from "./contracts";
import { SHARE_SECTIONS, type ShareSection } from "./share-sections";

/**
 * A complete, parseable snapshot for a shared download that carries only the
 * allowed sections. Sections that were not shared are replaced with neutral
 * placeholders (never the real values) and returned in `hidden`, so the
 * renderers skip them instead of printing placeholders. References into
 * hidden sections are dropped. An incomplete headline keeps its limitations:
 * a partial score never travels without its caveat.
 */
export function redactSharedSnapshot(raw: ReportSnapshot, permitted: Iterable<string>): { report: ReportSnapshot; hidden: Set<ShareSection> } {
  const source = reportSnapshotSchema.parse(raw);
  const allowed = new Set(permitted);
  const hidden = new Set(SHARE_SECTIONS.filter((section) => !allowed.has(section)));
  const show = (section: ShareSection) => !hidden.has(section);
  const incomplete = show("metrics") && source.metrics.headline_status === "incomplete";
  const report: ReportSnapshot = {
    schema_version: source.schema_version,
    report_revision_id: source.report_revision_id,
    run_id: source.run_id,
    created_at: source.created_at,
    content_hash: source.content_hash,
    system: show("system") ? source.system : { name: "", target_revision_id: "", purpose: "", execution_mode: source.system.execution_mode },
    scope: show("scope")
      ? source.scope
      : { suite_version_id: "", evidence_policy: "exploratory", started_at: source.created_at, finished_at: source.created_at, languages: [], review_status: "preliminary" },
    metrics: show("metrics")
      ? source.metrics
      : {
          n_planned: 0, n_eligible: 0, n_executed: 0, n_scorable: 0, n_pass: 0, n_partial: 0, n_fail: 0, n_unscorable: 0, n_pending: 0, n_unresolved: 0,
          strict_pass_rate: null, rubric_score: null, assessed_coverage: null, execution_completion: null,
          pass_bounds: null, wilson_interval: null, family_cluster_interval: null, critical_unassessed: 0, headline_status: "complete",
        },
    findings: show("findings") ? source.findings.map((finding) => ({ ...finding, assessment_ids: show("results") ? finding.assessment_ids : [] })) : [],
    results: show("results") ? source.results : [],
    improvements: show("improvements") ? source.improvements.map((item) => ({ ...item, finding_ids: show("findings") ? item.finding_ids : [] })) : [],
    methodology: show("methodology")
      ? source.methodology
      : {
          cef_version: "1.0", scorer_version: "", grader_revisions: [], rubric_revisions: [], source_revisions: [], sampling: "", exclusions: [], review_coverage: "", cost: null,
          limitations: incomplete ? source.methodology.limitations : [],
        },
    takeaways: show("takeaways")
      ? source.takeaways.map((item) => ({ ...item, finding_ids: show("findings") ? item.finding_ids : [], assessment_ids: show("results") ? item.assessment_ids : [] }))
      : [],
  };
  return { report: reportSnapshotSchema.parse(report), hidden };
}
