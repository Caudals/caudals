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
  "/d": `<!doctype html><title>Authenticated app</title><main></main><script>
    (async()=>{
      const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('auth',1);req.onupgradeneeded=()=>req.result.createObjectStore('tokens');req.onsuccess=()=>resolve(req.result);req.onerror=reject;});
      if(location.search.includes('fixture-login')) {
        localStorage.setItem('auth','fixture');sessionStorage.setItem('auth','fixture');
        await new Promise(resolve=>{const tx=db.transaction('tokens','readwrite');tx.objectStore('tokens').put('fixture','auth');tx.oncomplete=resolve;});
        history.replaceState({},'', '/d');
      }
      const token=await new Promise(resolve=>{const req=db.transaction('tokens').objectStore('tokens').get('auth');req.onsuccess=()=>resolve(req.result);});db.close();
      if(token!=='fixture'||localStorage.getItem('auth')!=='fixture'||sessionStorage.getItem('auth')!=='fixture'){document.querySelector('main').textContent='Sign in';return;}
      document.querySelector('main').innerHTML='<div class="chat-thread"></div><form><textarea placeholder="Ask the assistant"></textarea><button type="submit">Send</button></form>';
      let turn=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();const input=document.querySelector('textarea'),q=input.value;input.value='';
        const user=document.createElement('p');user.className='user-message';user.textContent=q;document.querySelector('.chat-thread').append(user);
        const answer=document.createElement('p');answer.className='assistant-message';document.querySelector('.chat-thread').append(answer);
        history.pushState({},'', '/d/conversation/one');setTimeout(()=>answer.textContent='App reply '+(++turn)+': '+q,200);
      };
    })();</script>`,
  "/no-chat": "<!doctype html><h1>Signed in, no chatbot here</h1>",
  // The likeliest-looking launcher leads to a sales page; the real chat sits behind "Help".
  "/f": `<!doctype html><title>Phi</title><h1>Phi bank</h1>
    <button style="position:fixed;right:24px;bottom:100px;width:64px;height:64px" onclick="location.href='/f/sales'">Talk to sales</button>
    <button class="help-btn" style="position:fixed;right:24px;bottom:24px;width:120px;height:40px" onclick="document.querySelector('.box').hidden=false">Help</button>
    <div class="box" hidden><div class="feed"></div><textarea placeholder="Type your question"></textarea></div><script>
    const ta=document.querySelector('textarea');ta.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();const q=ta.value.trim();if(!q)return;ta.value='';
      const feed=document.querySelector('.feed');const u=document.createElement('p');u.className='q';u.textContent=q;feed.append(u);
      setTimeout(()=>{const a=document.createElement('p');a.className='answer';a.textContent='Phi: '+q;feed.append(a);},300);});
    </script>`,
  "/f/sales": "<!doctype html><h1>Book a sales call</h1><form><input name=\"company\" placeholder=\"Company\"></form>",
  // A consent dialog that covers the page and a launcher that is a plain
  // floating element (an avatar with a pointer cursor), as on many EU sites.
  "/e": `<!doctype html><title>Epsilon</title><h1>Epsilon insurance</h1>
    <div id="consent" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10"><div class="cookie-notice" style="background:#fff;margin:120px auto;width:520px;padding:24px">
      <p>Usamos cookies propias y de terceros. Puedes aceptarlas o rechazarlas.</p><button id="cfg">Configurar cookies</button><button id="no">Rechazar</button><button id="yes">Aceptar</button></div></div>
    <div class="assistant-avatar" style="position:fixed;right:24px;bottom:24px;width:72px;height:72px;border-radius:50%;background:#c00;cursor:pointer;z-index:5"></div>
    <section class="panel" hidden style="position:fixed;right:24px;bottom:110px;width:360px"><div class="feed"></div><input class="field" placeholder="Escribe aquí"></section><script>
    let choice='none';const close=value=>{choice=value;document.getElementById('consent').remove();};
    setTimeout(()=>{},0);document.getElementById('no').onclick=()=>close('rejected');document.getElementById('yes').onclick=()=>close('accepted');
    document.querySelector('.assistant-avatar').addEventListener('click',()=>{document.querySelector('.panel').hidden=false;});
    const field=document.querySelector('.field');field.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const q=field.value.trim();if(!q)return;field.value='';
      const feed=document.querySelector('.feed');const u=document.createElement('div');u.className='bubble mine';u.textContent=q;feed.append(u);
      setTimeout(()=>{const a=document.createElement('div');a.className='bubble bot-answer';a.textContent='Epsilon: '+q+' (cookies '+choice+')';feed.append(a);},400);});
    </script>`,
};

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "web-app-autoteach-"));
  const key = join(directory, "key.pem"), cert = join(directory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-keyout", key, "-out", cert], { stdio: "ignore" });
  const server: Server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    const url = new URL(request.url ?? "/", "https://fixture");
    // A Clerk-style app: a short session cookie for the site, refreshed by a
    // handshake on its own auth subdomain that holds the long-lived cookie.
    const host = request.headers.host ?? "", port = host.split(":").at(-1);
    if (host.startsWith("sso.other.test")) { response.writeHead(302, { "set-cookie": "idp=third-party; Secure; Path=/", location: `https://clerk.example.test:${port}/login` }); response.end(); return; }
    if (host.startsWith("clerk.example.test")) {
      const signedIn = url.pathname === "/login" || request.headers.cookie?.includes("__client=c1");
      response.writeHead(302, signedIn
        ? { "set-cookie": ["__client=c1; Secure; HttpOnly; Path=/; Max-Age=86400", "sess=ok; Domain=example.test; Secure; Path=/; Max-Age=3"], location: `https://www.example.test:${port}/g` }
        : { location: `https://www.example.test:${port}/sign-in` });
      response.end(); return;
    }
    if (host.startsWith("www.example.test")) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      if (url.pathname === "/sign-in") { response.end("<!doctype html><h1>Sign in</h1><input type=\"password\">"); return; }
      if (!request.headers.cookie?.includes("sess=ok")) { response.end(`<!doctype html><script>location.href='https://clerk.example.test:${port}/handshake'</script>`); return; }
      response.end(`<!doctype html><div class="log"></div><textarea placeholder="Ask"></textarea><script>
        const ta=document.querySelector('textarea');ta.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();const q=ta.value.trim();ta.value='';
        const u=document.createElement('p');u.className='me';u.textContent=q;document.querySelector('.log').append(u);
        setTimeout(()=>{const a=document.createElement('p');a.className='bot';a.textContent='Signed in: '+q;document.querySelector('.log').append(a);},300);});</script>`);
      return;
    }
    if (request.headers.host?.startsWith("www.localhost") && url.pathname === "/d") {
      response.writeHead(302, { location: `https://app.localhost:${request.headers.host.split(":").at(-1)}/d` }); response.end(); return;
    }
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
test.beforeAll(async () => { site = await fixture(); browser = await chromium.launch({ args: ["--ignore-certificate-errors", "--host-resolver-rules=MAP www.localhost 127.0.0.1, MAP app.localhost 127.0.0.1, MAP www.example.test 127.0.0.1, MAP clerk.example.test 127.0.0.1, MAP sso.other.test 127.0.0.1"] }); });
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

test("retains all login stores across a website-to-app handoff and replays the fresh composer instead of its conversation URL", async () => {
  test.setTimeout(120_000);
  const port = new URL(site.origin).port;
  const endpoint = `https://www.localhost:${port}/d`, app = `https://app.localhost:${port}`;
  const destinationCheck = async (url: string) => {
    if (![new URL(endpoint).origin, app].includes(new URL(url).origin)) throw new Error("destination_denied");
  };
  const control = new BrowserControl({ browser, destinationCheck });
  const scope = { orgId: randomUUID(), actorId: "owner", targetId: randomUUID(), endpoint };
  try {
    const { sessionId } = await control.dispatch(scope, { action: "open" }) as { sessionId: string };
    await expect.poll(() => browser.contexts().at(-1)?.pages()[0]?.url(), { timeout: 10000 }).toBe(`${app}/d`);
    await control.dispatch(scope, { action: "navigate", sessionId, url: `${app}/d?fixture-login` });
    await browser.contexts().at(-1)!.pages()[0].getByRole("textbox").waitFor();
    const before = await control.dispatch(scope, { action: "checkpoint", sessionId }) as { storageState: BrowserStorageState; endpoint: string };
    expect(before.endpoint).toBe(`${app}/d`);
    expect(before.storageState.origins.find(origin => origin.origin === app)?.indexedDB?.length).toBe(1);
    expect(before.storageState.session_storage?.find(origin => origin.origin === app)?.entries).toContainEqual({ name: "auth", value: "fixture" });
    await control.dispatch(scope, { action: "autoteach", sessionId });
    await expect.poll(async () => (await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState).test.status,
      { timeout: 90000, intervals: [500] }).toMatch(/ready|failed/);
    const state = await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState;
    expect(state.teach.error).toBeNull(); expect(state.test.error).toBeNull();
    const result = await control.dispatch(scope, { action: "result", sessionId }) as { recipe: WebsiteRecipe; storageState: BrowserStorageState };
    expect(result.recipe.start_url).toBe(`${app}/d`);
    expect((await invokeWebsite({ browser, recipe: result.recipe, storageState: result.storageState, destinationCheck,
      input: question("Does the login persist?"), context: context(scope.orgId) })).messages.at(-1)?.content).toBe("App reply 1: Does the login persist?");
    // "Connect again" while the page shows the probe's conversation URL starts over from the composer.
    expect(browser.contexts().at(-1)!.pages()[0].url()).toBe(`${app}/d/conversation/one`);
    await control.dispatch(scope, { action: "autoteach", sessionId });
    await expect.poll(async () => (await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState).test.status,
      { timeout: 90000, intervals: [500] }).toMatch(/ready|failed/);
    const again = await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState;
    expect(again.teach.error).toBeNull(); expect(again.test.error).toBeNull();
    expect((await control.dispatch(scope, { action: "result", sessionId }) as { recipe: WebsiteRecipe }).recipe.start_url).toBe(`${app}/d`);
    await control.dispatch(scope, { action: "navigate", sessionId, url: `${app}/no-chat` });
    await control.dispatch(scope, { action: "autoteach", sessionId });
    await expect.poll(async () => (await control.dispatch(scope, { action: "snapshot", sessionId }) as RemoteState).teach.status,
      { timeout: 40000, intervals: [500] }).toBe("failed");
    // No input or reply was found, but retaining the login still works.
    expect((await control.dispatch(scope, { action: "checkpoint", sessionId }) as { storageState: BrowserStorageState }).storageState.origins.length).toBeGreaterThan(0);
  } finally { await control.close(); }
});

test("declines a covering cookie dialog and opens a chat whose launcher is a floating avatar", async () => {
  test.setTimeout(90_000);
  const destinationCheck = async (url: string) => { if (new URL(url).origin !== site.origin) throw new Error("destination_denied"); };
  const draft = await autoDetectWebsiteRecipe({ browser, url: `${site.origin}/e`, destinationCheck, recipeRevisionId: randomUUID() });
  expect(draft.launcher).toMatchObject({ kind: "css", value: "div.assistant-avatar" });
  expect(draft.submit).toEqual({ kind: "press_enter" });
  const { withContentHash } = await import("../../lib/evals/contracts/hashing");
  const recipe = withContentHash(draft) as WebsiteRecipe;
  // Every fresh run session meets the dialog again and declines it.
  const observation = await invokeWebsite({ browser, destinationCheck, recipe, input: question("¿Qué cubre el seguro de hogar?"), context: context(randomUUID()) });
  expect(observation.messages.at(-1)?.content).toBe("Epsilon: ¿Qué cubre el seguro de hogar? (cookies rejected)");
});

test("a launcher that leads to another page is undone and the next candidate opens the chat", async () => {
  test.setTimeout(90_000);
  const destinationCheck = async (url: string) => { if (new URL(url).origin !== site.origin) throw new Error("destination_denied"); };
  const draft = await autoDetectWebsiteRecipe({ browser, url: `${site.origin}/f`, destinationCheck, recipeRevisionId: randomUUID() });
  expect(draft.start_url).toBe(`${site.origin}/f`);
  expect(draft.launcher).toMatchObject({ kind: "role", role: "button", name: "Help" });
  const { withContentHash } = await import("../../lib/evals/contracts/hashing");
  const observation = await invokeWebsite({ browser, destinationCheck, recipe: withContentHash(draft) as WebsiteRecipe, input: question("Opening hours?"), context: context(randomUUID()) });
  expect(observation.messages.at(-1)?.content).toBe("Phi: Opening hours?");
});

test("a saved login keeps the site's own auth subdomain, so a fresh browser stays signed in, but never a third-party provider", async () => {
  test.setTimeout(90_000);
  const port = new URL(site.origin).port;
  const endpoint = `https://www.example.test:${port}/g`;
  const allowed = [`https://www.example.test:${port}`, `https://clerk.example.test:${port}`, `https://sso.other.test:${port}`];
  const destinationCheck = async (url: string) => { if (!allowed.includes(new URL(url).origin)) throw new Error("destination_denied"); };
  const control = new BrowserControl({ browser, destinationCheck });
  const scope = { orgId: randomUUID(), actorId: "owner", targetId: randomUUID(), endpoint };
  try {
    const { sessionId } = await control.dispatch(scope, { action: "open" }) as { sessionId: string };
    // Sign in through a third-party identity provider that hands off to the site's auth subdomain.
    await control.dispatch(scope, { action: "navigate", sessionId, url: `https://sso.other.test:${port}/` });
    await browser.contexts().at(-1)!.pages()[0].getByPlaceholder("Ask").waitFor();
    const saved = (await control.dispatch(scope, { action: "checkpoint", sessionId }) as { storageState: BrowserStorageState }).storageState;
    expect(saved.cookies.map(cookie => `${cookie.name}@${cookie.domain}`)).toEqual(expect.arrayContaining(["__client@clerk.example.test"]));
    expect(saved.cookies.some(cookie => cookie.name === "idp")).toBe(false);
    // The short session cookie expires; a fresh browser refreshes it through the auth subdomain.
    await new Promise(resolve => setTimeout(resolve, 3_500));
    const { withContentHash } = await import("../../lib/evals/contracts/hashing");
    const recipe = withContentHash({ schema_version: "1.0", recipe_revision_id: randomUUID(), source: "operator_authored", start_url: endpoint, launcher: null, frame_chain: [],
      input: { kind: "css", value: "textarea", frames: [] }, submit: { kind: "press_enter" }, message_container: { kind: "css", value: ".bot", frames: [] }, assistant_message: { kind: "css", value: ".bot", frames: [] },
      completion: { kind: "quiescent", quiet_ms: 1500 }, reset: { kind: "new_context" }, assistant_extraction: "last_new_message", created_at: new Date().toISOString(), extensions: {} }) as WebsiteRecipe;
    const observation = await invokeWebsite({ browser, destinationCheck, recipe, storageState: saved, input: question("Still signed in?"), context: context(scope.orgId) });
    expect(observation.messages.at(-1)?.content).toBe("Signed in: Still signed in?");
  } finally { await control.close(); }
});
