import { join } from "node:path";
import type { Page } from "@playwright/test";

/**
 * axe-core in the UI harness (launch L-24, P-46): WCAG 2.0, 2.1 and 2.2 A/AA
 * plus axe's best practices, reporting serious and critical violations only.
 * Returns readable lines (`rule: selector — summary`) so a failure names the
 * element to fix.
 */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const axePath = join(process.cwd(), "node_modules/axe-core/axe.min.js");

type AxeResult = { violations: Array<{ id: string; impact: string | null; help: string; nodes: Array<{ target: string[]; failureSummary?: string }> }> };

export async function seriousAxeViolations(page: Page, options: { include?: string; exclude?: string[] } = {}) {
  // Colours are checked at rest: entrance fades still running would blend
  // their text into the background. (Infinite ones, such as a caret, stay.)
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity && !(animation.timeline && !(animation.timeline instanceof DocumentTimeline)))
    .map((animation) => animation.finished.catch(() => undefined))));
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: axePath });
  return page.evaluate(async ([include, exclude, tags]) => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<AxeResult> } }).axe;
    const context = include ? { include: [include], exclude: exclude.map((item) => [item]) } : { exclude: exclude.map((item) => [item]) };
    const result = await axe.run(context, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return result.violations
      .filter((item) => item.impact === "serious" || item.impact === "critical")
      .flatMap((item) => item.nodes.map((node) => `${item.id}: ${node.target.join(" ")} — ${(node.failureSummary ?? item.help).split("\n").slice(0, 2).join(" ")}`));
  }, [options.include ?? null, options.exclude ?? [], AXE_TAGS] as const);
}
