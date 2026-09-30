import { chromium, expect, test } from "@playwright/test";
import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { BrowserControl } from "../../services/evals-browser/control";
import type { BrowserStorageState, WebsiteRecipe } from "../../lib/evals/contracts/browser";
import { invokeWebsite } from "../../lib/evals/connectors/browser-executor";

test("remote control, popup authentication, iframe teaching, encrypted-state reuse and normalized eval execution", async () => {
  test.setTimeout(70_000);
  const directory = mkdtempSync(join(tmpdir(), "web-app-fixture-"));
  const key = join(directory, "key.pem"), cert = join(directory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1", "-keyout", key, "-out", cert], { stdio: "ignore" });
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    response.setHeader("content-type", "text/html");
    if (request.url === "/sso") { response.setHeader("set-cookie", "auth=fixture; Secure; HttpOnly; SameSite=Lax; Path=/"); response.end(`<button data-testid="finish" onclick="opener.location.href='/';window.close()">Complete 2FA</button>`); return; }
    if (request.url === "/widget") { response.end(`<!doctype html><label>Question<textarea data-testid="prompt"></textarea></label><button data-testid="send">Send</button><div role="log"><p class="assistant-message">Welcome</p></div><script>
      let turn=0;document.querySelector('button').onclick=()=>{const button=document.querySelector('button'),prompt=document.querySelector('textarea').value;button.disabled=true;const p=document.createElement('p');p.className='assistant-message';document.querySelector('[role=log]').append(p);setTimeout(()=>p.textContent='Partial',50);setTimeout(()=>{p.textContent='Complete '+(++turn)+': '+prompt;button.disabled=false},350)};
    </script>`); return; }
    if (!request.headers.cookie?.includes("auth=fixture")) { response.end(`<button data-testid="sso" onclick="window.open('/sso')">Sign in with SSO</button>`); return; }
    response.end(`<button data-testid="launcher" onclick="document.querySelector('iframe').hidden=false">Open chat</button><iframe data-testid="chat-frame" src="/widget" hidden style="display:block;width:600px;height:500px"></iframe><script>sessionStorage.setItem('token','fixture-session-storage')</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("fixture_port_missing");
  const endpoint = `https://127.0.0.1:${address.port}/`;
  const browser = await chromium.launch({ args: ["--ignore-certificate-errors"] });
  const destinationCheck = async (url: string) => { if (new URL(url).origin !== new URL(endpoint).origin) throw new Error("destination_denied"); };
  const control = new BrowserControl({ browser, destinationCheck });
  const scope = { orgId: randomUUID(), actorId: "fixture-owner", targetId: randomUUID(), endpoint };
  try {
    const opened = await control.dispatch(scope, { action: "open" }) as { sessionId: string };
    const sessionId = opened.sessionId;
    await expect(control.dispatch({ ...scope, orgId: randomUUID() }, { action: "snapshot", sessionId })).rejects.toThrow("browser_control_denied");
    await expect(control.dispatch(scope, { action: "click", sessionId, x: 30, y: 20, button: "left" })).rejects.toThrow("control_required");
    await expect(control.dispatch(scope, { action: "open" })).rejects.toThrow("browser_capacity");
    await control.dispatch(scope, { action: "mode", sessionId, mode: "control" });
    await control.dispatch(scope, { action: "click", sessionId, x: 55, y: 17, button: "left" });
    await expect.poll(() => browser.contexts()[0].pages().length).toBe(2);
    await browser.contexts()[0].pages()[1].getByTestId("finish").waitFor();
    const popup = await control.dispatch(scope, { action: "snapshot", sessionId }) as { tabs: unknown[] };
    expect(popup.tabs).toHaveLength(2);
    await control.dispatch(scope, { action: "click", sessionId, x: 50, y: 17, button: "left" });
    const page = browser.contexts()[0].pages()[0];
    await page.getByTestId("launcher").waitFor();
    await control.dispatch(scope, { action: "mode", sessionId, mode: "teach" });
    const select = async (part: "launcher" | "input" | "submit" | "response", element: import("playwright").Locator) => {
      const box = await element.boundingBox(); if (!box) throw new Error("fixture_element_missing");
      await control.dispatch(scope, { action: "click", sessionId, part, x: box.x + box.width / 2, y: box.y + box.height / 2, button: "left" });
    };
    await select("launcher", page.getByTestId("launcher"));
    await control.dispatch(scope, { action: "mode", sessionId, mode: "control" });
    await page.getByTestId("launcher").click();
    const frame = page.frameLocator('[data-testid="chat-frame"]');
    await control.dispatch(scope, { action: "mode", sessionId, mode: "teach" });
    await select("input", frame.getByTestId("prompt"));
    await select("submit", frame.getByTestId("send"));
    await select("response", frame.locator(".assistant-message"));
    const saved = await control.dispatch(scope, { action: "save", sessionId }) as { recipe: WebsiteRecipe; storageState: BrowserStorageState };
    expect(saved.recipe.input).toMatchObject({ kind: "test_id", value: "prompt", frames: [{ kind: "test_id", value: "chat-frame" }] });
    expect(saved.recipe.launcher?.frames).toEqual([]);
    expect(saved.storageState.cookies.some(cookie => cookie.name === "auth")).toBe(true);
    expect(saved.storageState.session_storage?.[0].entries.some(item => item.name === "token")).toBe(true);
    expect(await frame.locator(".assistant-message").getAttribute("data-caudals-selected")).not.toBeNull();
    await control.dispatch(scope, { action: "test", sessionId });
    await expect.poll(async () => (await control.dispatch(scope, { action: "snapshot", sessionId }) as { test: { status: string } }).test.status, { timeout: 20_000 }).toBe("ready");
    const result = await control.dispatch(scope, { action: "result", sessionId }) as { recipe: WebsiteRecipe; storageState: BrowserStorageState; response: string };
    expect(result.response).toContain("Complete"); expect(result.response).not.toBe("Partial");
    const observation = await invokeWebsite({ browser, destinationCheck, recipe: result.recipe, storageState: result.storageState,
      input: { schema_version: "1.0", case_id: "case", case_revision_id: "case-v1", messages: [{ role: "user", content: "Eval question" }], attachments: [], tools: [] },
      context: { run_id: "run", target_revision_id: "revision", execution_plan_id: "plan", tenant_scope_handle: scope.orgId, deadline: new Date(Date.now() + 5000).toISOString(), attempt_id: "attempt", scoped_credential_handle: null, destination_policy_id: "fixture", reserved_cost: { amount: "0", currency: "EUR" }, signal: new AbortController().signal } });
    expect(observation.messages.at(-1)?.content).toBe("Complete 1: Eval question");
    await control.dispatch(scope, { action: "close", sessionId });
    await expect(control.dispatch(scope, { action: "snapshot", sessionId })).rejects.toThrow("browser_session_expired");
    expect(browser.contexts()).toHaveLength(0);
  } finally { await control.close(); await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, { recursive: true, force: true }); }
});
