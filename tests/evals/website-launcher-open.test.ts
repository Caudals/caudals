import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { invokeWebsite } from "../../lib/evals/connectors/browser-executor";

const chromiumInstalled = existsSync(chromium.executablePath());

// Visor.ai (Seguros Atocha): the widget first paints its closed panel
// unstyled, on screen while the page is still short, then its stylesheet
// hides it; the launcher must still be clicked. Once opened, the greeting
// arrives late and must not be read as the reply.
const WIDGET = `<!doctype html><html><body style="margin:0;font:16px sans-serif">
  <div id="panel"><div id="msgs"></div><textarea id="ta"></textarea><button id="send">Enviar</button></div>
  <div id="launcher" style="display:none;position:fixed;right:20px;bottom:20px;width:60px;height:60px;background:#29a">chat</div>
  <style id="late"></style>
  <script>
    const say = (text) => { const bubble = document.createElement("div"); bubble.className = "bot"; bubble.textContent = text; document.getElementById("msgs").append(bubble); };
    setTimeout(() => {
      document.getElementById("late").textContent = "#panel{position:fixed;right:20px;bottom:90px;width:300px;background:#eee;display:none}#panel.open{display:block}";
      document.getElementById("launcher").style.display = "block";
    }, 700);
    let greeted = false;
    document.getElementById("launcher").onclick = () => {
      document.getElementById("panel").classList.toggle("open");
      if (!greeted) { greeted = true; setTimeout(() => say("¡Hola! Bienvenido al asistente virtual."), 600); }
    };
    document.getElementById("send").onclick = () => {
      const question = document.getElementById("ta").value;
      document.getElementById("ta").value = "";
      setTimeout(() => say("Respuesta a: " + question), 300);
    };
  </script>
</body></html>`;

describe.skipIf(!chromiumInstalled)("opening a launcher widget", () => {
  let real: Browser;
  beforeAll(async () => { real = await chromium.launch(); });
  afterAll(async () => { await real?.close(); });

  it("clicks the launcher past a self-closing unstyled panel and captures only the reply", async () => {
    // Serve the fixture in place of the network; the destination guard's own
    // routes are not under test here.
    const browser = {
      newContext: async (options: Parameters<Browser["newContext"]>[0]) => {
        const context = await real.newContext(options);
        await context.route("https://widget.test/**", (route) => route.fulfill({ contentType: "text/html", body: WIDGET }));
        return Object.assign(context, { route: async () => undefined, routeWebSocket: async () => undefined });
      },
    } as unknown as Browser;
    const css = (value: string) => ({ kind: "css" as const, value, frames: [] });
    const recipe = {
      schema_version: "1.0", recipe_revision_id: "00000000-0000-4000-8000-000000000001", source: "operator_authored",
      start_url: "https://widget.test/", frame_chain: [], launcher: css("#launcher"), input: css("#ta"),
      submit: { kind: "click", locator: css("#send") }, message_container: css("#msgs"), assistant_message: css("div.bot"),
      completion: { kind: "quiescent", quiet_ms: 500 }, reset: { kind: "new_context" }, assistant_extraction: "last_new_message",
      created_at: new Date().toISOString(), extensions: {}, content_hash: "0".repeat(64),
    } as unknown as Parameters<typeof invokeWebsite>[0]["recipe"];
    const observation = await invokeWebsite({
      browser,
      recipe,
      destinationCheck: async () => undefined,
      input: { schema_version: "1.0", case_id: "c", case_revision_id: "c", messages: [{ role: "user", content: "¿Qué cubre el seguro?" }], attachments: [], tools: [] },
      context: {
        run_id: "r", target_revision_id: recipe.recipe_revision_id, execution_plan_id: "p", tenant_scope_handle: "t",
        deadline: new Date(Date.now() + 30_000).toISOString(), attempt_id: "a", scoped_credential_handle: null,
        destination_policy_id: "public-https-v1", reserved_cost: { amount: "0", currency: "EUR" }, signal: new AbortController().signal,
      },
    } as Parameters<typeof invokeWebsite>[0]);
    const reply = [...observation.messages].reverse().find((message) => message.role === "assistant")?.content;
    expect(reply).toBe("Respuesta a: ¿Qué cubre el seguro?");
  }, 60_000);
});
