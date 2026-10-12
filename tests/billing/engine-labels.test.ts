/**
 * The billing pause labels (L-11): a run paused for credits says what to do,
 * in English and Spanish, and never shows a raw reason code.
 */
import { afterEach, describe, expect, it } from "vitest";
import { evaluationStage } from "../../components/evals/evaluation-stage";
import { humanize, toneFor } from "../../components/evals/primitives";
import { setLocale, t } from "../../lib/evals/messages/en";

const paused = (reason: string) => evaluationStage({ preparation_status: "ready", selected_suite_version_id: "s", latest_run_status: "paused", latest_run_reason_code: reason }, false);

describe("billing pause labels", () => {
  afterEach(() => setLocale("en"));
  it("labels credits_exhausted and cap_reached runs in English and Spanish", () => {
    expect(paused("credits_exhausted")).toMatchObject({ key: "paused", label: "Paused — add credits to continue", tone: "warn", needsAction: true });
    expect(paused("cap_reached").label).toBe("Paused — spending cap reached");
    expect(humanize("credits_exhausted")).toBe("Paused — add credits to continue");
    expect(toneFor("cap_reached")).toBe("warn");
    expect(t("runPausedCreditsHelp")).toMatch(/^Paused — add credits to continue/);
    setLocale("es");
    expect(paused("credits_exhausted").label).toBe("En pausa: añade créditos para continuar");
    expect(humanize("cap_reached")).toBe("En pausa: límite de gasto alcanzado");
    expect(t("runPausedCreditsHelp")).toMatch(/^En pausa: añade créditos para continuar/);
    expect(t("genStopCredits")).toMatch(/^En pausa: añade créditos/);
  });
});
