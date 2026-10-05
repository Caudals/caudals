import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { firstWord, search } from "@/components/demo/pow";
import { plainAnswer } from "@/components/demo/answer-text";
import { addressBucket, clientAddress } from "./client";
import { acceptTest, buildExcerpts, completeObjects } from "./generate";
import { lexicalVerdict, parseJudgement, precheck, summarize } from "./judge";
import { issueChallenge, leadingZeroBits, verifyChallenge } from "./pow";
import { classifyTarget, findMessageSlot, findResponsePath, parseCurl, setPath, TargetInputError } from "./target";
import { allowedByRobots, extractPage, pinPublic, rankLinks, robotsDisallows } from "./web";

vi.stubEnv("DEMO_SECRET", "test-secret");

describe("client address", () => {
  const headers = (values: Record<string, string>) => new Headers(values);
  it("trusts cf-connecting-ip only when the peer is a Cloudflare edge", () => {
    expect(clientAddress(headers({ "x-forwarded-for": "172.70.1.2", "cf-connecting-ip": "81.33.4.5" }))).toBe("81.33.4.5");
    expect(clientAddress(headers({ "x-forwarded-for": "9.9.9.9", "cf-connecting-ip": "81.33.4.5" }))).toBe("9.9.9.9");
    // A spoofed first entry is ignored; the last hop is the one Traefik saw.
    expect(clientAddress(headers({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }))).toBe("9.9.9.9");
  });
  it("groups an IPv6 visitor by /64", () => {
    expect(addressBucket("2a01:4f8:c0c:1::1")).toBe(addressBucket("2a01:4f8:c0c:1:ffff::2"));
    expect(addressBucket("2a01:4f8:c0c:1::1")).not.toBe(addressBucket("2a01:4f8:c0c:2::1"));
  });
});

describe("proof of work", () => {
  it("browser hash matches node's SHA-256 first word", () => {
    for (const message of ["", "a", "0123456789abcdef0123456789abcdef:12345", "x".repeat(55)]) {
      expect(firstWord(message)).toBe(createHash("sha256").update(message).digest().readUInt32BE(0));
    }
  });
  it("accepts a solved challenge once per visitor and rejects tampering", () => {
    const challenge = { ...issueChallenge("visitor"), bits: 18 };
    const nonce = String(search(challenge.salt, 12));
    expect(leadingZeroBits(createHash("sha256").update(`${challenge.salt}:${nonce}`).digest())).toBeGreaterThanOrEqual(12);
    const solved = String(search(challenge.salt, 18));
    expect(verifyChallenge(challenge, solved, "visitor")).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyChallenge(challenge, solved, "someone-else")).toBeNull();
    expect(verifyChallenge({ ...challenge, expires: challenge.expires + 1 }, solved, "visitor")).toBeNull();
    expect(verifyChallenge(challenge, solved, "visitor", challenge.expires + 1)).toBeNull();
  });
});

describe("page reading", () => {
  const base = new URL("https://example.es/ayuda");
  it("extracts the main text, title and links without scripts or navigation", () => {
    const page = extractPage(`<html lang="es"><head><title>Ayuda &amp; tarifas</title><script>alert(1)</script></head><body>
      <nav><a href="/login">Entrar</a></nav>
      <main><h2>Comisiones</h2><p>La custodia cuesta 0,10&nbsp;% al año para carteras de menos de 10.000 €.</p>${"<p>Texto de relleno sobre condiciones del servicio.</p>".repeat(12)}</main>
      <footer>Cookies</footer><a href="/tarifas">Tarifas</a></body></html>`, base);
    expect(page.title).toBe("Ayuda & tarifas");
    expect(page.lang).toBe("es");
    expect(page.text).toContain("## Comisiones");
    expect(page.text).toContain("0,10 % al año");
    expect(page.text).not.toContain("alert");
    expect(page.text).not.toContain("Entrar");
    expect(page.links.map((link) => link.url)).toContain("https://example.es/tarifas");
  });
  it("ranks help and pricing pages and skips blogs, logins and other sites", () => {
    const ranked = rankLinks([
      { url: "https://example.es/blog/novedades", label: "Blog" },
      { url: "https://example.es/preguntas-frecuentes", label: "Preguntas frecuentes" },
      { url: "https://other.com/tarifas", label: "Tarifas" },
      { url: "https://example.es/login", label: "Entrar" },
      { url: "https://www.example.es/tarifas", label: "Tarifas" },
    ], base, 5);
    expect(ranked).toEqual(["https://example.es/preguntas-frecuentes", "https://www.example.es/tarifas"]);
  });
  it("honours robots.txt for any agent and for CaudalsBot", () => {
    const rules = robotsDisallows("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /privado\nDisallow: /*.pdf$\n\nUser-agent: CaudalsBot\nDisallow: /beta");
    expect(rules).toEqual(["/privado", "/*.pdf$", "/beta"]);
    expect(allowedByRobots(new URL("https://example.es/privado/x"), rules)).toBe(false);
    expect(allowedByRobots(new URL("https://example.es/doc.pdf"), rules)).toBe(false);
    expect(allowedByRobots(new URL("https://example.es/doc.pdf.html"), rules)).toBe(true);
    expect(allowedByRobots(new URL("https://example.es/ayuda"), rules)).toBe(true);
  });
  it("refuses private, local and non-HTTPS destinations", async () => {
    const lookup = (async () => [{ address: "10.0.0.5", family: 4 }]) as never;
    await expect(pinPublic("https://intranet.example.com/", lookup)).rejects.toThrow("destination_denied");
    await expect(pinPublic("http://example.com/")).rejects.toThrow("destination_invalid");
    await expect(pinPublic("https://localhost/")).rejects.toThrow("destination_invalid");
    await expect(pinPublic("https://user:pw@example.com/")).rejects.toThrow("destination_invalid");
    const ok = await pinPublic("https://example.com/a?b=1", (async () => [{ address: "93.184.215.14", family: 4 }]) as never);
    expect(ok.address).toBe("93.184.215.14");
  });
});

describe("targets", () => {
  it("infers the kind from one field", () => {
    expect(classifyTarget("mapfre.es").spec).toEqual({ kind: "website", url: "https://mapfre.es/" });
    const api = classifyTarget("https://api.example.com/v1", { model: "m", apiKey: "sk-1" });
    expect(api.spec).toEqual({ kind: "openai_compatible", url: "https://api.example.com/v1/chat/completions", model: "m" });
    expect(api.secrets).toEqual({ authorization: "Bearer sk-1" });
    expect(() => classifyTarget("https://api.example.com/v1/chat/completions")).toThrow(TargetInputError);
  });
  it("parses a curl command and finds where the question goes", () => {
    const curl = parseCurl(`curl -X POST 'https://bot.example.com/api/ask' \\\n  -H 'Authorization: Bearer abc' -H "Content-Type: application/json" \\\n  -d '{"session":"s1","query":"¿hola?","lang":"es"}'`);
    expect(curl.url.href).toBe("https://bot.example.com/api/ask");
    expect(curl.headers.authorization).toBe("Bearer abc");
    expect(findMessageSlot(curl.body)).toEqual(["query"]);
    expect(findMessageSlot({ messages: [{ role: "system", content: "x" }, { role: "user", content: "hi" }] })).toEqual(["messages", 1, "content"]);
    expect(findMessageSlot({ input: { text: "Pregunta: {{question}}" } })).toEqual(["input", "text"]);
    expect(setPath({ input: { text: "Pregunta: {{question}}" } }, ["input", "text"], "¿Cuánto cuesta?")).toEqual({ input: { text: "Pregunta: ¿Cuánto cuesta?" } });
    const classified = classifyTarget(`curl https://bot.example.com/api/ask -H 'x-api-key: k' -H 'Host: evil' -d '{"message":"hi"}'`);
    expect(classified.secrets).toEqual({ "x-api-key": "k" });
  });
  it("finds the reply in an unknown JSON response", () => {
    expect(findResponsePath({ id: "x", data: { answer: "La cuota es de 5 €" } }, "q")).toEqual(["data", "answer"]);
    expect(findResponsePath({ meta: { id: "9f1c2e7a-1111-2222-3333-444455556666" }, result: { messages: [{ text: "Sí, puedes cancelarlo en 14 días." }] } }, "q")).toEqual(["result", "messages", 0, "text"]);
  });
});

describe("generation", () => {
  const pages = [{ url: "https://e.es/a", title: "Tarifas", text: "## Tarifas\nLa custodia cuesta 0,109 % IVA incluido para carteras de menos de 10 mil euros al año.\nLas aportaciones mínimas son de 100 euros por transferencia bancaria desde la UE." }];
  const excerpts = buildExcerpts(pages);
  it("reads complete test objects from an unfinished stream", () => {
    const stream = '{"tests":[{"question":"a","excerpt":"1.1"},{"question":"b with } and \\" inside","excerpt":"1.1"},{"question":"c';
    expect(completeObjects(stream)).toHaveLength(2);
  });
  it("accepts a grounded test, re-points its citation and drops facts not in the source", () => {
    const accepted = acceptTest({ question: "¿Cuánto cuesta la custodia?", expected: "0,109 % con IVA.", facts: ["0,109 % IVA incluido", "gratis"], quote: "La custodia cuesta 0,109 % IVA incluido para carteras de menos de 10 mil euros", excerpt: "9.9", severity: "high" }, excerpts, [], "q1");
    expect(accepted).toMatchObject({ id: "q1", page: 0, facts: ["0,109 % IVA incluido"], severity: "high" });
  });
  it("rejects invented quotes and repeated questions", () => {
    expect(acceptTest({ question: "¿Hay comisión de apertura?", expected: "No.", facts: [], quote: "No hay comisión de apertura en ninguna cuenta", excerpt: "1.1" }, excerpts, [], "q1")).toBeNull();
    const first = acceptTest({ question: "¿Cuánto cuesta la custodia?", expected: "0,109 %.", facts: [], quote: "La custodia cuesta 0,109 % IVA incluido", excerpt: "1.1" }, excerpts, [], "q1")!;
    expect(acceptTest({ question: "¿Cuánto cuesta la custodia?", expected: "x", facts: [], quote: "La custodia cuesta 0,109 % IVA incluido", excerpt: "1.1" }, excerpts, [first], "q2")).toBeNull();
  });
});

describe("judging", () => {
  const item = { id: "q1", question: "¿Cuánto cuesta la custodia?", expected: "0,109 % IVA incluido.", facts: ["0,109 %"], quote: "0,109 % IVA incluido", page: 0, severity: "high" as const };
  it("does not score errors and echoes, and fails an empty reply", () => {
    expect(precheck(item, { text: "", ms: 0, error: "timeout" }, "es")?.verdict).toBe("unscored");
    expect(precheck(item, { text: "", ms: 10, error: null }, "es")?.verdict).toBe("no_answer");
    expect(precheck(item, { text: "¿Cuánto cuesta la custodia?", ms: 10, error: null }, "es")?.verdict).toBe("unscored");
    expect(precheck(item, { text: "Cuesta un 0,109 %.", ms: 10, error: null }, "es")).toBeNull();
  });
  it("reads the judge's verdicts and normalises legacy labels", () => {
    const verdicts = parseJudgement('```json\n{"results":[{"id":"q1","verdict":"partially_correct","cause":"weird","facts":[],"note":"Falta el IVA."},{"id":"q2","verdict":"incorrect","cause":"wrong_information","facts":[{"fact":"5 €","status":"contradicted"}],"note":"Dice 7 €."}]}\n```');
    expect(verdicts.get("q1")).toMatchObject({ verdict: "partial", cause: "missing_information" });
    expect(verdicts.get("q2")).toMatchObject({ verdict: "incorrect", cause: "wrong_information" });
  });
  it("falls back to word matching and summarises", () => {
    expect(lexicalVerdict(item, { text: "Es del 0,109 % anual.", ms: 1, error: null }, "es").verdict).toBe("correct");
    expect(lexicalVerdict(item, { text: "Es del 0,2 % anual.", ms: 1, error: null }, "es").verdict).toBe("unscored");
    const summary = summarize([item, { ...item, id: "q2" }, { ...item, id: "q3" }], {
      q1: { verdict: "correct", cause: null, note: "", facts: [], method: "judge" },
      q2: { verdict: "incorrect", cause: "wrong_information", note: "", facts: [], method: "judge" },
      q3: { verdict: "unscored", cause: null, note: "", facts: [], method: "precheck" },
    });
    expect(summary).toMatchObject({ total: 3, scored: 2, correct: 1, incorrect: 1, unscored: 1, causes: { wrong_information: 1 } });
  });
});

describe("answer text", () => {
  it("previews a markdown answer as one plain paragraph", () => {
    expect(plainAnswer("**Sí.** Puedes:\n\n- cancelar en 14 días\n- [ver condiciones](https://e.es/c)")).toBe("Sí. Puedes: · cancelar en 14 días · ver condiciones");
  });
});
