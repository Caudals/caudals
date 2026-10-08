import { describe, expect, it } from "vitest";
import { locateQuote } from "../../lib/evals/contracts/quote-anchors";

const page = (url: string, body: string) => `# Page\n\nSource URL: ${url}\n\n${body}\n\n`;
const text = page("https://support.example.com/es/esp/comisiones", "La comisión   de gestión es del 0,380 % anual para carteras de 10 a 100 mil €.")
  + page("https://support.example.com/es/esp/minimo", "La inversión mínima inicial es de 1000 €. Este importe mínimo también es el mínimo que se tiene que mantener.");
const split = 120;
const source = {
  revision_id: "rev-1",
  anchors: [
    { id: "a2", excerpt: text.slice(split), locator: `utf16:${split}:${text.length}` },
    { id: "a1", excerpt: text.slice(0, split), locator: `utf16:0:${split}` },
  ],
};

describe("locateQuote", () => {
  it("finds a quote ignoring case, repeated spaces and non-breaking spaces", () => {
    expect(locateQuote([source], "la comisión de gestión es del 0,380 % anual")).toEqual({ source_revision_id: "rev-1", anchors: ["a1"], url: "https://support.example.com/es/esp/comisiones" });
  });

  it("returns every anchor a quote spans", () => {
    const quote = text.slice(split - 20, split + 20);
    expect(locateQuote([source], quote)?.anchors).toEqual(["a1", "a2"]);
  });

  it("only accepts the page named by the URL", () => {
    expect(locateQuote([source], "inversión mínima inicial es de 1000 €", "https://support.example.com/es/esp/minimo/")?.url).toBe("https://support.example.com/es/esp/minimo");
    expect(locateQuote([source], "inversión mínima inicial es de 1000 €", "https://support.example.com/es/esp/comisiones")).toBeNull();
  });

  it("rejects quotes that are absent or too short", () => {
    expect(locateQuote([source], "la comisión es del 0,250 %")).toBeNull();
    expect(locateQuote([source], "1000 €")).toBeNull();
  });
});
