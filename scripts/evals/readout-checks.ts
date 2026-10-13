/**
 * Layout checks for readout slides (launch L-35), shared by the PDF render
 * test and the UI harness contract: nothing inside a slide is clipped, wider
 * than the slide, or runs into the footer; body text is at least the size
 * the projector rule asks for.
 */
import type { Page } from "@playwright/test";

export type SlideProblem = { slide: string; element: string; text: string };

/** Elements of every `.rd-slide` on the page that leave the slide or reach the footer band. */
export async function slideProblems(page: Page): Promise<SlideProblem[]> {
  return page.evaluate(() => {
    const problems: Array<{ slide: string; element: string; text: string }> = [];
    for (const slide of Array.from(document.querySelectorAll<HTMLElement>(".rd-slide"))) {
      const box = slide.getBoundingClientRect();
      const foot = slide.querySelector<HTMLElement>(".rd-foot")?.getBoundingClientRect();
      const fluid = getComputedStyle(slide).aspectRatio === "auto";
      if (!fluid && slide.scrollHeight > slide.clientHeight + 1) problems.push({ slide: slide.dataset.slide ?? "", element: "slide", text: "content taller than the slide" });
      for (const element of Array.from(slide.querySelectorAll<HTMLElement>("*"))) {
        if (element.closest(".rd-foot")) continue;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const wide = rect.right > box.right + 1 || rect.left < box.left - 1;
        const low = !fluid && (rect.bottom > box.bottom + 1 || (foot ? rect.bottom > foot.top + 1 : false));
        const clipped = element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX !== "visible" && !element.matches(".rd-bar");
        if (wide || low || clipped) problems.push({ slide: slide.dataset.slide ?? "", element: element.className || element.tagName, text: (element.textContent ?? "").trim().slice(0, 60) });
      }
    }
    return problems;
  });
}

/**
 * The smallest rendered font size of slide body text (questions, answers,
 * sentences, rows, fixes, next steps) on the current slide, in CSS pixels as
 * displayed (the slide may be scaled to the window).
 */
export async function smallestBodyText(page: Page, root = ".p-readout-stage .rd-slide"): Promise<number> {
  return page.evaluate((selector) => {
    const slide = document.querySelector<HTMLElement>(selector);
    if (!slide) return 0;
    const body = Array.from(slide.querySelectorAll<HTMLElement>(".rd-quote,.rd-excerpt,[data-why],.rd-sentences li,.rd-row > span:first-child,.rd-fix-title,.rd-points li,.rd-purpose,.rd-lead,[data-cover]"));
    const sizes = body.filter((element) => element.textContent?.trim()).map((element) => parseFloat(getComputedStyle(element).fontSize));
    return sizes.length ? Math.min(...sizes) : 0;
  }, root);
}
