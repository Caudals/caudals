import { describe, expect, it } from "vitest";
import { foreignScript } from "../../lib/evals/generation/auto-draft";

describe("generated text quality", () => {
  it("flags a token from another writing system that the quote never uses", () => {
    const quote = "La asignación de acciones depende del perfil de riesgo del cliente.";
    expect(foreignScript("¿Cómo se协2 define la asignación de acciones?", quote)).toBe(true);
    expect(foreignScript("¿Cómo se define la asignación de acciones?", quote)).toBe(false);
    // A source that is itself in that script is fine.
    expect(foreignScript("¿Qué significa 投资?", "El término 投资 significa inversión.")).toBe(false);
    expect(foreignScript("Что такое ETF?", quote)).toBe(true);
  });
});
