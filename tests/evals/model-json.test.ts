import { describe, expect, it } from "vitest";
import { parseModelJsonText, repairJson, restoreValuesWrapper } from "../../lib/evals/providers/model-json";

describe("model JSON repair", () => {
  it("returns valid JSON untouched and strips fences and prose", () => {
    expect(parseModelJsonText('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJsonText('Here you go:\n```json\n{"a":[1,2]}\n```\nAnything else?')).toEqual({ a: [1, 2] });
    expect(parseModelJsonText('Verdict [final]: {"verdict":"correct"}')).toEqual({ verdict: "correct" });
  });
  it("escapes raw control characters and removes trailing commas", () => {
    expect(parseModelJsonText('{"a":"x\ty\nz","b":[1,2,],}')).toEqual({ a: "x\ty\nz", b: [1, 2] });
  });
  it("drops a closer that ends the object while members follow, and stray closers", () => {
    expect(JSON.parse(repairJson('{"a":{"b":1}},"c":2}'))).toEqual({ a: { b: 1 }, c: 2 });
    expect(JSON.parse(repairJson('{"a":[1]]}'))).toEqual({ a: [1] });
  });
  it("drops an object closed too early inside a list (seen in a production draft)", () => {
    const draft = '{"cases":[{"question":"q1","keyFacts":"fact"},"anchorId":"a1","severity":"high"},{"question":"q2","keyFacts":["f"],"anchorId":"a2"}]}';
    expect(parseModelJsonText(draft)).toEqual({ cases: [
      { question: "q1", keyFacts: "fact", anchorId: "a1", severity: "high" },
      { question: "q2", keyFacts: ["f"], anchorId: "a2" },
    ] });
    // A closer followed by the next member of its parent object is fine and kept.
    expect(parseModelJsonText('{"a":{"b":1},"c":{"d":2}}')).toEqual({ a: { b: 1 }, c: { d: 2 } });
  });
  it("leaves truncated output invalid instead of inventing an ending", () => {
    expect(() => parseModelJsonText('{"a":[1,2')).toThrow("model_output_not_json");
    expect(() => parseModelJsonText("no json here")).toThrow("model_output_not_json");
  });
  it("restores a lost {\"values\": wrapper in a profile list field (seen in production)", () => {
    // The model wrote "materialRisks":[…],"confidence":…} without the opening {"values":.
    const broken = '{"tasks":{"values":["a"],"confidence":0.9,"citations":[]},"materialRisks":["loss of capital"],"confidence":0.99,"citations":[{"quote":"q"}]},"allowedActions":{"values":["sign up"],"confidence":0.8,"citations":[]}}';
    const fixed = parseModelJsonText(broken, [restoreValuesWrapper(["tasks", "materialRisks", "allowedActions"])]) as Record<string, { values: string[]; citations: unknown[] }>;
    expect(fixed.materialRisks.values).toEqual(["loss of capital"]);
    expect(fixed.materialRisks.citations).toHaveLength(1);
    expect(fixed.allowedActions.values).toEqual(["sign up"]);
    expect(fixed.tasks.values).toEqual(["a"]);
  });
});
