import { describe, expect, it } from "vitest";
import { searchHelp, searchTokens, type HelpIndex } from "./articles";
import { blocksText, linkTargets, markdownProblems, parseInline, parseMarkdown } from "./markdown";
import en from "./generated/en.json";
import es from "./generated/es.json";

const english = (en as unknown as HelpIndex).articles;
const spanish = (es as unknown as HelpIndex).articles;
const top = (articles: HelpIndex["articles"], query: string) => searchHelp(articles, query)[0]?.slug;

describe("help search", () => {
  it("finds English articles by keyword", () => {
    expect(top(english, "captcha")).toBe("connect-website-chat");
    expect(top(english, "api key")).toBe("connect-api");
    expect(top(english, "scanned pdf")).toBe("uploads");
    expect(top(english, "approve test set")).toBe("prepare-and-run");
    expect(top(english, "what does partly correct mean")).toBe("reading-results");
    expect(top(english, "revoke share link")).toBe("reports-and-sharing");
    expect(top(english, "regression")).toBe("schedules-and-alerts");
    expect(top(english, "credits")).toBe("credits-and-billing");
    expect(top(english, "delete workspace")).toBe("data-and-privacy");
    expect(top(english, "invite a colleague")).toBe("team-and-roles");
    expect(top(english, "demo")).toBe("free-test");
    expect(top(english, "contact support")).toBe("getting-help");
  });

  it("finds Spanish articles by keyword, ignoring accents and stop words", () => {
    expect(top(spanish, "captcha")).toBe("connect-website-chat");
    expect(top(spanish, "clave de api")).toBe("connect-api");
    expect(top(spanish, "pdf escaneado")).toBe("uploads");
    expect(top(spanish, "aprobar conjunto")).toBe("prepare-and-run");
    expect(top(spanish, "que significa parcialmente correcta")).toBe("reading-results");
    expect(top(spanish, "revocar enlace")).toBe("reports-and-sharing");
    expect(top(spanish, "regresion")).toBe("schedules-and-alerts");
    expect(top(spanish, "creditos")).toBe("credits-and-billing");
    expect(top(spanish, "eliminar espacio")).toBe("data-and-privacy");
    expect(top(spanish, "invitar compañero")).toBe("team-and-roles");
    expect(top(spanish, "prueba gratuita")).toBe("free-test");
    expect(top(spanish, "ayuda contacto")).toBe("getting-help");
  });

  it("matches the start of a word, returns everything for an empty query and nothing for nonsense", () => {
    expect(top(english, "invit")).toBe("team-and-roles");
    expect(searchHelp(english, "  ")).toHaveLength(12);
    expect(searchHelp(english, "the and of")).toHaveLength(12);
    expect(searchHelp(english, "zzqx")).toEqual([]);
    expect(searchTokens("¿Cómo CONECTO el chat?")).toEqual(["conecto", "chat"]);
  });
});

describe("help Markdown subset", () => {
  it("parses headings with anchors, lists, code and inline marks", () => {
    const blocks = parseMarkdown("Intro **bold** and *em* with `code` and [a link](help:uploads#answers).\n\n## Title {#anchor}\n\n1. One\n2. Two\n   continued\n\n- A\n- B\n\n```\ncurl x\n```\n");
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "heading", "list", "list", "code"]);
    expect(blocks[1]).toMatchObject({ kind: "heading", level: 2, id: "anchor", text: "Title" });
    expect(blocks[2]).toMatchObject({ kind: "list", ordered: true });
    expect(blocksText(blocks)).toContain("Two continued");
    expect(linkTargets(blocks)).toEqual(["help:uploads#answers"]);
    expect(parseInline("**a** *b* `c`").map((node) => node.kind)).toEqual(["strong", "text", "em", "text", "code"]);
  });

  it("flags syntax outside the subset", () => {
    expect(markdownProblems("# Title")).toHaveLength(1);
    expect(markdownProblems("| a | b |")).toHaveLength(1);
    expect(markdownProblems("<b>x</b>")).toHaveLength(1);
    expect(markdownProblems("- a\n  - nested")).toHaveLength(1);
    expect(markdownProblems("Use `<CODE>` here.")).toEqual([]);
  });
});
