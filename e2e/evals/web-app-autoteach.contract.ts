import { chromium, expect, test, type Browser } from "@playwright/test";
import { createServer, type Server } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { BrowserControl } from "../../services/evals-browser/control";
import type { RemoteState, RemoteStreamMessage } from "../../lib/evals/contracts/remote-browser";
import type { BrowserStorageState, WebsiteRecipe } from "../../lib/evals/contracts/browser";
import { invokeWebsite } from "../../lib/evals/connectors/browser-executor";
import { autoDetectWebsiteRecipe } from "../../lib/evals/connectors/browser-autodetect";

// Three synthetic chatbots that share nothing but being chatbots: a closed
// launcher with an iframe widget and a Stop button, a page that streams over
// SSE with no visible busy signal and hashed class names, and a rich-text
// composer that sends on Enter and shows typing dots. Every assistant echoes
// the question, which must not be mistaken for the user's own message.
const pages: Record<string, string> = {
  "/a": `<!doctype html><title>Acme</title><h1>Acme support</h1><p>Welcome to the help centre.</p>
    <button class="launcher-btn" aria-label="Open chat" style="position:fixed;right:24px;bottom:24px;width:56px;height:56px;border-radius:50%" onclick="document.querySelector('iframe').style.display='block';this.style.display='none'">💬</button>
    <iframe title="Support chat" src="/a/widget" style="display:none;position:fixed;right:24px;bottom:24px;width:380px;height:520px;border:0"></iframe>`,
  "/a/widget": `<!doctype html><div class="chat-window"><div class="messages"></div>
    <form class="composer"><textarea placeholder="Ask anything" rows="2"></textarea><button type="button" class="attach" aria-label="Attach file">+</button>
    <button type="submit" aria-label="Send message"><svg width="16" height="16"><path d="M0 0L16 8L0 16z"/></svg></button>
    <button type="button" class="stop" aria-label="Stop generating" hidden>■</button></form></div><script>
    let turn=0;const form=document.querySelector('form'),log=document.querySelector('.messages'),stop=document.querySelector('.stop'),send=form.querySelector('[type=submit]');
    form.addEventListener('submit',e=>{e.preventDefault();const ta=form.querySelector('textarea');const q=ta.value.trim();if(!q)return;ta.value='';
      const u=document.createElement('div');u.className='msg user-msg';u.textContent=q;log.append(u);
      const a=document.createElement('div');a.className='msg assistant-msg';const body=document.createElement('div');body.className='markdown';a.append(body);
      const copy=document.createElement('button');copy.textContent='Copy';a.append(copy);log.append(a);
      stop.hidden=false;send.hidden=true;turn++;const words=('Reply '+turn+' to '+q+' — thanks for asking!').split(' ');let i=0;
      const tick=()=>{if(i<words.length){body.textContent+=(i?' ':'')+words[i++];setTimeout(tick,i===3?900:40);}else{stop.hidden=true;send.hidden=false;}};setTimeout(tick,250);});
    </script>`,
  "/b": `<!doctype html><title>Beta</title><main><div id="log" class="x9f3a1"></div>
    <input id="q" class="k2j8d0" type="text"><button class="b7c1e2" id="go">→</button></main><script>
    document.getElementById('go').onclick=async()=>{const q=document.getElementById('q').value;document.getElementById('q').value='';
      const log=document.getElementById('log');const u=document.createElement('p');u.className='turn-user';u.textContent=q;log.append(u);
      const r=document.createElement('div');r.className='turn-bot';log.append(r);
      const response=await fetch('/b/stream?q='+encodeURIComponent(q));const reader=response.body.getReader();const decoder=new TextDecoder();
      for(;;){const {done,value}=await reader.read();if(done)break;r.textContent+=decoder.decode(value);}};
    </script>`,
  "/c": `<!doctype html><title>Gamma</title><div class="thread"></div><div class="dots typing-indicator" hidden>…</div>
    <div class="editor" contenteditable="true" role="textbox" aria-label="Message Gamma"></div><script>
    let turn=0;const ed=document.querySelector('.editor');ed.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey)return;e.preventDefault();
      const q=ed.innerText.trim();if(!q)return;ed.innerHTML='';const t=document.querySelector('.thread');
      const u=document.createElement('div');u.dataset.author='user';u.textContent=q;t.append(u);const dots=document.querySelector('.dots');dots.hidden=false;
      setTimeout(()=>{dots.hidden=true;const a=document.createElement('div');a.dataset.author='assistant';a.textContent='Gamma '+(++turn)+': '+q;t.append(a);},700);});
    </script>`,
};

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "web-app-autoteach-"));
  const key = join(directory, "key.pem"), cert = join(directory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-keyout", key, "-out", cert], { stdio: "ignore" });
  const server: Server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    const url = new URL(request.url ?? "/", "https://fixture");
    if (url.pathname === "/b/stream") {
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      const words = `Beta answer about ${url.searchParams.get("q")}, with care.`.split(" ");
      let index = 0;
      // A long pause mid-stream: text stability alone would cut the reply short.
      const tick = () => { if (index >= words.length) { response.end(); return; } response.write((index ? " " : "") + words[index++]); setTimeout(tick, index === 2 ? 1_700 : 60); };
      setTimeout(tick, 200);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(pages[url.pathname] ?? "<!doctype html>Not found");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture_port_missing");
  const origin = `https://127.0.0.1:${address.port}`;
  return { origin, close: async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, { recursive: true, force: true }); } };
}

const context = (orgId: string) => ({ run_id: "run", target_revision_id: "revision", execution_plan_id: "plan", tenant_scope_handle: orgId, deadline: new Date(Date.now() + 20_000).toISOString(), attempt_id: randomUUID(), scoped_credential_handle: null, destination_policy_id: "fixture", reserved_cost: { amount: "0", currency: "EUR" }, signal: new AbortController().signal });
const question = (content: string) => ({ schema_version: "1.0" as const, case_id: "case", case_revision_id: "case-v1", messages: [{ role: "user" as const, content }], attachments: [], tools: [] });

let browser: Browser;
let site: Awaited<ReturnType<typeof fixture>>;
test.beforeAll(async () => { site = await fixture(); browser = await chromium.launch({ args: ["--ignore-certificate-errors"] }); });
test.afterAll(async () => { await browser.close(); await site.close(); });

test("one click teaches a closed iframe widget, streams live frames and validates a reusable connector", async () => {
  test.setTimeout(120_000);
  const destinationCheck = async (url: string) => { if (new URL(url).origin !== site.origin) throw new Error("destination_denied"); };
  const control = new BrowserControl({ browser, destinationCheck });
  const scope = { orgId: randomUUID(), actorId: "owner", targetId: randomUUID(), endpoint: `${site.origin}/a` };
  try {
    const { sessionId } = await control.dispatch(scope, { action: "open" }) as { sessionId: string };
    // Reopening resumes the same session instead of failing on capacity.
    expect((await control.dispatch(scope, { action: "open" }) as { sessionId: string; resumed: boolean })).toMatchObject({ sessionId, resumed: true });
    const messages: RemoteStreamMessage[] = [];
    const unsubscribe = control.subscribe(scope, sessionId, message => { messages.push(message); });
    await expect.poll(() => messages.some(message => message.type === "frame"), { timeout: 10_000 }).toBe(true);
    const frame = messages.find(message => message.type === "frame") as Extract<RemoteStreamMessage, { type: "frame" }>;
    expect(frame.width).toBe(1280); expect(Buffer.from(frame.image, "base64").subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(() => control.subscribe({ ...scope, actorId: "someone-else" }, sessionId, () => {})).toThrow("browser_control_denied");

    await control.dispatch(scope, { action: "autoteach", sessionId });
    const latest = () => [...messages].reverse().find(message => message.type === "state") as Extract<RemoteStreamMessage, { type: "state" }> | undefined;
    await expect.poll(() => latest()?.state.test.status ?? "idle", { timeout: 100_000, intervals: [500] }).toMatch(/ready|failed/);
    const state: RemoteState = latest()!.state;
    expect(state.teach.error).toBeNull(); expect(state.test.error).toBeNull();
    expect(state.test.status).toBe("ready");
    expect(Object.keys(state.parts).sort()).toEqual(["input", "launcher", "response", "submit"]);
    expect(state.parts.response?.rect).not.toBeNull();
    expect(state.completion).toBe("selector_hidden");
    const result = await control.dispatch(scope, { action: "result", sessionId }) as { recipe: WebsiteRecipe; storageState: BrowserStorageState; response: string };
    expect(result.recipe.launcher).toMatchObject({ kind: "role", role: "button", name: "Open chat" });
    expect(result.recipe.input.frames?.length).toBe(1);
    expect(result.recipe.completion).toMatchObject({ kind: "selector_hidden" });
    expect(result.response).toMatch(/thanks for asking!$/);
    unsubscribe();

    const observation = await invokeWebsite({ browser, destinationCheck, recipe: result.recipe, storageState: result.storageState, input: question("What is the refund window?"), context: context(scope.orgId) });
    expect(observation.messages.at(-1)?.content).toBe("Reply 1 to What is the refund window? — thanks for asking!");
    await control.dispatch(scope, { action: "close", sessionId });
  } finally { await control.close(); }
});

test("unattended detection learns network-confirmed completion when the page shows no busy signal", async () => {
  test.setTimeout(90_000);
  const destinationCheck = async (url: string) => { if (new URL(url).origin !== site.origin) throw new Error("destination_denied"); };
  const draft = await autoDetectWebsiteRecipe({ browser, url: `${site.origin}/b`, destinationCheck, recipeRevisionId: randomUUID() });
  expect(draft.completion).toMatchObject({ kind: "quiescent" });
  expect(draft.input).toMatchObject({ kind: "css" });
  expect(draft.assistant_message).toMatchObject({ kind: "css", value: "div.turn-bot" });
  const { withContentHash } = await import("../../lib/evals/contracts/hashing");
  const recipe = withContentHash(draft) as WebsiteRecipe;
  const observation = await invokeWebsite({ browser, destinationCheck, recipe, input: question("pricing"), context: context(randomUUID()) });
  expect(observation.messages.at(-1)?.content).toBe("Beta answer about pricing, with care.");
});

test("a rich-text composer that sends on Enter and shows typing dots is detected and replayed", async () => {
  test.setTimeout(90_000);
  const destinationCheck = async (url: string) => { if (new URL(url).origin !== site.origin) throw new Error("destination_denied"); };
  const draft = await autoDetectWebsiteRecipe({ browser, url: `${site.origin}/c`, destinationCheck, recipeRevisionId: randomUUID() });
  expect(draft.submit).toEqual({ kind: "press_enter" });
  expect(draft.input).toMatchObject({ kind: "role", role: "textbox", name: "Message Gamma" });
  expect(draft.assistant_message).toMatchObject({ kind: "css", value: 'div[data-author="assistant"]' });
  expect(draft.completion.kind).toBe("selector_hidden");
  const { withContentHash } = await import("../../lib/evals/contracts/hashing");
  const recipe = withContentHash(draft) as WebsiteRecipe;
  const ctx = context(randomUUID());
  const observation = await invokeWebsite({ browser, destinationCheck, recipe, input: question("Do you ship to Spain?"), context: ctx });
  expect(observation.messages.at(-1)?.content).toBe("Gamma 1: Do you ship to Spain?");
});
