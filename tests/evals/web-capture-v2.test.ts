import { describe, expect, it } from "vitest";
import { newAssistantMessages, pickGuidedAction } from "../../lib/evals/connectors/browser-executor";

describe("web app capture v2", () => {
  it("ignores the user's own echoed bubble and keeps waiting for the reply", () => {
    const prompt = "¿En cuántas cuotas se puede dividir el recibo?";
    expect(newAssistantMessages(["Hola, soy AMI"], ["Hola, soy AMI", prompt], prompt).messages).toEqual([]);
    expect(newAssistantMessages(["Hola, soy AMI"], ["Hola, soy AMI", prompt, "Puedes pagarlo en 12 cuotas."], prompt).messages).toEqual(["Puedes pagarlo en 12 cuotas."]);
  });
  it("collects every bubble of a split reply in order", () => {
    expect(newAssistantMessages(["Bienvenido"], ["Bienvenido", "Perdóname 🙏", "¿Lo puedes intentar con otras palabras?"]).messages)
      .toEqual(["Perdóname 🙏", "¿Lo puedes intentar con otras palabras?"]);
  });
  it("handles trimmed histories, growing containers and re-rendered lists", () => {
    expect(newAssistantMessages(["A", "B", "C"], ["B", "C", "D"]).messages).toEqual(["D"]);
    expect(newAssistantMessages(["Hola."], ["Hola. La comisión es del 10 %."]).messages).toEqual(["La comisión es del 10 %."]);
    expect(newAssistantMessages(["Welcome 10:31"], ["Welcome 10:32", "The fee is 10%."]).messages).toEqual(["Welcome 10:32", "The fee is 10%."]);
    expect(newAssistantMessages(["old"], ["old", "new", "new"])).toEqual({ messages: ["new", "new"], duplicateFree: false });
  });
  it("follows a quick reply only when one label clearly matches and is safe", () => {
    const actions = [{ label: "Seguro de coche", external: false }, { label: "Seguro de hogar", external: false }, { label: "Contratar seguro", external: false }];
    expect(pickGuidedAction("¿Qué cubre el seguro de hogar ante una inundación?", actions)).toBe(1);
    expect(pickGuidedAction("¿Cuánto cuesta un seguro?", actions)).toBeNull();
    expect(pickGuidedAction("Quiero contratar un seguro", [{ label: "Contratar seguro", external: false }])).toBeNull();
    expect(pickGuidedAction("Hogar", [{ label: "Seguro de hogar", external: true }])).toBeNull();
  });
});
