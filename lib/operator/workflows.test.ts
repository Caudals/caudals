import { describe, expect, it } from "vitest";
import {
  buildTransitionAuditEvent,
  checkTransition,
  getNextWorkflowTransitions,
  getWorkflowNameForRecordType,
  isTerminalWorkflowState,
  workflowDefinitions,
} from "@/lib/operator/workflows";

describe("operator workflow state machines", () => {
  it("defines every deployed state machine from the blueprint", () => {
    expect(Object.keys(workflowDefinitions).sort()).toEqual([
      "active_learning_loop",
      "build",
      "buyer_opportunity",
      "cleanlab_qa_pass",
      "compliance_control_scope",
      "contract",
      "delivery",
      "delta_manifest",
      "dsar",
      "enrichment_manifest",
      "label_batch",
      "modality_contract",
      "release_documentation_bundle",
      "run",
      "sample_preview_access",
      "subscription",
      "supplier_opportunity",
    ]);
  });

  it("allows the build happy path through G-1 to G-7 stages", () => {
    const path = [
      "planned",
      "intaking",
      "profiling",
      "cleaning",
      "privacy",
      "enriching",
      "labeling",
      "qa",
      "packaging",
      "released",
      "delivered",
    ];

    for (let index = 0; index < path.length - 1; index += 1) {
      expect(checkTransition("build", path[index], path[index + 1])).toMatchObject({
        ok: true,
      });
    }

    expect(isTerminalWorkflowState("build", "delivered")).toBe(true);
  });

  it("blocks silent skips in build state progression", () => {
    expect(checkTransition("build", "planned", "qa")).toEqual({
      ok: false,
      reason: "build cannot transition from planned to qa",
    });
  });

  it("allows QA rework to re-enter the pipeline explicitly", () => {
    expect(checkTransition("build", "qa", "rework")).toMatchObject({
      ok: true,
      transition: { label: "qa_failed" },
    });
    expect(checkTransition("build", "rework", "cleaning")).toMatchObject({
      ok: true,
      transition: { label: "re_enter_cleaning" },
    });
  });

  it("builds audit events only for valid transitions", () => {
    expect(
      buildTransitionAuditEvent({
        workflow: "supplier_opportunity",
        targetId: "so_01HZTEST",
        fromState: "sample_received",
        toState: "feasibility_done",
        reason: "Sample profile passed rights intake",
      })
    ).toEqual({
      action: "state_transition",
      target_type: "supplier_opportunity",
      target_id: "so_01HZTEST",
      metadata: {
        from_state: "sample_received",
        to_state: "feasibility_done",
        reason: "Sample profile passed rights intake",
      },
    });
  });

  it("maps queue record types to transition workflows", () => {
    expect(getWorkflowNameForRecordType("build")).toBe("build");
    expect(getWorkflowNameForRecordType("dsar_request")).toBe("dsar");
    expect(getWorkflowNameForRecordType("sample_preview_access")).toBe(
      "sample_preview_access"
    );
    expect(getWorkflowNameForRecordType("modality_contract")).toBe(
      "modality_contract"
    );
    expect(getWorkflowNameForRecordType("release_documentation_bundle")).toBe(
      "release_documentation_bundle"
    );
    expect(getWorkflowNameForRecordType("compliance_control_scope")).toBe(
      "compliance_control_scope"
    );
    expect(getWorkflowNameForRecordType("enrichment_manifest")).toBe(
      "enrichment_manifest"
    );
    expect(getWorkflowNameForRecordType("active_learning_loop")).toBe(
      "active_learning_loop"
    );
    expect(getWorkflowNameForRecordType("cleanlab_qa_pass")).toBe(
      "cleanlab_qa_pass"
    );
    expect(getWorkflowNameForRecordType("subscription")).toBe("subscription");
    expect(getWorkflowNameForRecordType("delta_manifest")).toBe("delta_manifest");
    expect(getWorkflowNameForRecordType("qa_report")).toBeNull();
  });

  it("returns next valid transitions for inline work queue controls", () => {
    expect(getNextWorkflowTransitions("build", "qa")).toEqual([
      { from: "qa", to: "packaging" },
      { from: "qa", to: "rework", label: "qa_failed" },
    ]);
    expect(getNextWorkflowTransitions("delivery", "accepted")).toEqual([]);
    expect(getNextWorkflowTransitions("sample_preview_access", "requested")).toEqual([
      { from: "requested", to: "nda_acknowledged" },
      { from: "requested", to: "denied" },
    ]);
    expect(getNextWorkflowTransitions("modality_contract", "review")).toEqual([
      { from: "review", to: "approved" },
      { from: "review", to: "blocked" },
    ]);
    expect(
      getNextWorkflowTransitions("release_documentation_bundle", "approved")
    ).toEqual([
      { from: "approved", to: "published" },
      { from: "approved", to: "superseded" },
    ]);
    expect(
      getNextWorkflowTransitions("compliance_control_scope", "evidence_review")
    ).toEqual([
      { from: "evidence_review", to: "ready" },
      { from: "evidence_review", to: "exception" },
    ]);
    expect(getNextWorkflowTransitions("enrichment_manifest", "blocked")).toEqual([
      { from: "blocked", to: "draft", label: "rework" },
    ]);
    expect(getNextWorkflowTransitions("active_learning_loop", "review")).toEqual([
      { from: "review", to: "queued" },
      { from: "review", to: "blocked" },
    ]);
    expect(getNextWorkflowTransitions("cleanlab_qa_pass", "review")).toEqual([
      { from: "review", to: "requeue" },
      { from: "review", to: "accepted" },
      { from: "review", to: "blocked" },
    ]);
    expect(getNextWorkflowTransitions("subscription", "active")).toEqual([
      { from: "active", to: "refreshing" },
      { from: "active", to: "paused" },
      { from: "active", to: "terminated" },
    ]);
    expect(getNextWorkflowTransitions("delta_manifest", "ready")).toEqual([
      { from: "ready", to: "published" },
      { from: "ready", to: "blocked" },
    ]);
  });
});
