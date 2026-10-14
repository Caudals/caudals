/**
 * English left on a Spanish screen (launch L-23, spec P-45). Collects every
 * visible text node and the attributes people hear (aria-label, title,
 * placeholder, alt…) and reports the ones that are English interface copy:
 * a value of the app or site catalogue whose Spanish differs, an English
 * label of the phrase table, or a fixed part of an English template. Content
 * (questions, answers, names in fixtures) is not catalogue copy, so it does
 * not count; code, `lang="en"` and `data-content` regions are skipped.
 */
import { expect, type Page } from "@playwright/test";
import { messages as appEn } from "../../lib/evals/messages/en";
import { es as appEs } from "../../lib/evals/messages/es";
import { phraseLabels } from "../../lib/evals/messages/phrases";
import siteEn from "../../lib/i18n/messages/en.json";
import siteEs from "../../lib/i18n/messages/es.json";
import { ALLOWED_TERMS, hasProse, termsPattern } from "../../scripts/lint/no-ui-literals.mjs";

function values(tree: unknown): string[] {
  if (typeof tree === "string") return [tree];
  if (tree && typeof tree === "object") return Object.values(tree).flatMap(values);
  return [];
}

const pattern = termsPattern(ALLOWED_TERMS);
const SLOT = /\{\w+\}/;
const spanish = new Set([...values(appEs), ...values(siteEs), ...phraseLabels().map(([, text]) => text)]);
const english = [...values(appEn), ...values(siteEn), ...phraseLabels().map(([text]) => text)].filter((text) => !spanish.has(text));
/** Whole English strings: a text node equal to one is a leak. */
const WHOLE = new Set(english.filter((text) => !SLOT.test(text) && hasProse(text, pattern)));
/** Fixed parts of English templates, three words or more, that no Spanish string contains. */
const spanishText = [...spanish].join("\n");
const PARTS = [...new Set(english.filter((text) => SLOT.test(text))
  .flatMap((text) => text.split(/\{\w+\}/))
  .map((part) => part.replace(/\s+/g, " ").trim())
  .filter((part) => (part.match(/\p{L}{2,}/gu) ?? []).length >= 3 && !spanishText.includes(part)))];

/** The fixed part as whole words ("on Caudals" is not inside "con Caudals"). */
const PART_PATTERNS = PARTS.map((part) => new RegExp(`(?<![\\p{L}\\p{N}])${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u"));

/** Strings a person can read or hear on the page. */
async function readable(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const skip = "code, pre, kbd, samp, script, style, [lang='en'], [data-content], [hidden]";
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const element = node.parentElement;
      if (!element || element.closest(skip)) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) out.push(text);
    }
    const attributes = ["aria-label", "aria-description", "aria-roledescription", "aria-valuetext", "title", "placeholder", "alt"];
    for (const element of document.querySelectorAll(attributes.map((name) => `[${name}]`).join(","))) {
      if (element.closest(skip)) continue;
      for (const name of attributes) {
        const value = element.getAttribute(name)?.replace(/\s+/g, " ").trim();
        if (value) out.push(value);
      }
    }
    return out;
  });
}

/** Common English words; on a screen whose content is Spanish too, any of them is a leak. */
const ENGLISH_WORDS = /(?<![\p{L}])(the|and|with|your|this|that|from|which|were|have|been|should|could)(?![\p{L}])/iu;

type Options = {
  /** Strings to accept on this screen (fixture content). */
  ignore?: readonly string[];
  /** Also flag any English common word: for screens whose fixture content is Spanish as well. */
  words?: boolean;
};

/** The English interface copy on the page (empty when the screen is all Spanish). */
export async function englishOnPage(page: Page, { ignore = [], words = false }: Options = {}): Promise<string[]> {
  const found = (await readable(page)).filter((text) => !ignore.includes(text)
    && (WHOLE.has(text) || PART_PATTERNS.some((part) => part.test(text)) || (words && ENGLISH_WORDS.test(text))));
  return [...new Set(found)];
}

/** Fails with the English strings a Spanish screen shows. */
export async function expectSpanishOnly(page: Page, screen: string, options: Options = {}) {
  expect(await englishOnPage(page, options), `English on the Spanish ${screen}`).toEqual([]);
}
