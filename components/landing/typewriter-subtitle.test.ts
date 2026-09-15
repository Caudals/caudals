import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TypewriterSubtitle } from "./typewriter-subtitle";

describe("TypewriterSubtitle", () => {
  it("renders accessible screen-reader text with the full content", () => {
    const text = "We test where your AI fails, and deploy domain experts.";
    const html = renderToStaticMarkup(
      React.createElement(TypewriterSubtitle, { text })
    );

    expect(html).toContain(`<span class="sr-only">${text}</span>`);
  });

  it("renders Spanish accented characters and punctuation", () => {
    const text =
      "Medimos dónde falla tu IA y movilizamos a profesionales de cada sector para crear los datos que resuelven sus errores";
    const html = renderToStaticMarkup(
      React.createElement(TypewriterSubtitle, { text })
    );

    expect(html).toContain(`<span class="sr-only">${text}</span>`);
    expect(html).toContain("dónde");
    expect(html).toContain("Medimos");
    expect(html).toContain("errores");
  });

  it("renders the text with transparent ghost and caret", () => {
    const text = "Alpha beta gamma";
    const html = renderToStaticMarkup(
      React.createElement(TypewriterSubtitle, { text })
    );

    expect(html).toContain("text-transparent");
    expect(html).toContain("caret-blink");
    expect(html).toContain("Alpha beta gamma");
  });

  it("handles empty string gracefully", () => {
    const html = renderToStaticMarkup(
      React.createElement(TypewriterSubtitle, { text: "" })
    );

    expect(html).toContain("caret-blink");
  });
});
