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
  it("defines every Phase 1 state machine from the blueprint", () => {
    expect(Object.keys(workflowDefinitions).sort()).toEqual([
      "build",
      "buyer_opportunity",
      "contract",
      "delivery",
      "dsar",
      "label_batch",
      "run",
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
    expect(getWorkflowNameForRecordType("qa_report")).toBeNull();
  });

  it("returns next valid transitions for inline work queue controls", () => {
    expect(getNextWorkflowTransitions("build", "qa")).toEqual([
      { from: "qa", to: "packaging" },
      { from: "qa", to: "rework", label: "qa_failed" },
    ]);
    expect(getNextWorkflowTransitions("delivery", "accepted")).toEqual([]);
  });
});
