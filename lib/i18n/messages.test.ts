import { describe, expect, it } from "vitest";

import { locales } from "@/lib/i18n/config";
import {
  createTranslator,
  getMessages,
  scopeTranslator,
} from "@/lib/i18n/messages";

type MessageTree = { [key: string]: string | MessageTree };

function flatten(tree: MessageTree, prefix = ""): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      entries.set(dotted, value);
    } else {
      for (const [k, v] of flatten(value, dotted)) entries.set(k, v);
    }
  }
  return entries;
}

describe("dictionaries", () => {
  it("define the same keys in every locale", () => {
    const [reference, ...others] = locales.map((locale) =>
      [...flatten(getMessages(locale) as MessageTree).keys()].sort(),
    );

    for (const keys of others) {
      expect(keys).toEqual(reference);
    }
  });

  it("have no blank translations", () => {
    for (const locale of locales) {
      const blank = [...flatten(getMessages(locale) as MessageTree)]
        .filter(([, value]) => value.trim() === "")
        .map(([key]) => key);

      expect(blank, `${locale} has blank values`).toEqual([]);
    }
  });

  it("keep the same interpolation slots across locales", () => {
    // A translation that renames a slot renders a literal "{year}" to a reader.
    const slots = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

    const english = flatten(getMessages("en") as MessageTree);

    for (const locale of locales) {
      const target = flatten(getMessages(locale) as MessageTree);
      for (const [key, value] of english) {
        expect(slots(target.get(key) ?? ""), `${locale}:${key}`).toEqual(
          slots(value),
        );
      }
    }
  });
});

describe("createTranslator", () => {
  it("resolves a nested key in the requested locale", () => {
    expect(createTranslator("es")("nav.contact")).toBe("Contacto");
    expect(createTranslator("en")("nav.contact")).toBe("Contact");
  });

  it("fills interpolation slots", () => {
    expect(createTranslator("en")("footer.rights", { year: 2026 })).toBe(
      "© 2026 Caudals. All rights reserved.",
    );
  });

  it("leaves an unfilled slot visible rather than blanking it", () => {
    // A missing value should be obvious in review, not silently empty.
    expect(createTranslator("en")("footer.rights")).toContain("{year}");
  });
});

describe("scopeTranslator", () => {
  it("resolves keys relative to its namespace", () => {
    const t = scopeTranslator(createTranslator("es"), "nav");
    expect(t("diagnostic")).toBe("Diagnóstico gratuito");
  });
});
