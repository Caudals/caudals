/**
 * Launch L-24c: the evaluation app sends the browser one language and, outside
 * the signed-in app, only the keys a page can show (lib/evals/messages/runtime.ts,
 * client-keys.ts, client-messages.ts). These checks keep that true:
 *
 * - the generated key lists match the code (`npm run i18n:evals-client-keys`);
 * - no browser code imports the catalogues, and none reads a message when its
 *   module loads (messages arrive while the page renders);
 * - each page outside the signed-in app renders, in both languages, with only
 *   the keys it sends, and reads none it did not send.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/workspace/sign-in",
  useRouter: () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} }),
  useSearchParams: () => new URLSearchParams(),
  redirect: () => undefined,
  notFound: () => undefined,
}));

import EvaluationError from "@/app/(evaluation)/error";
import EvaluationLoading from "@/app/(evaluation)/loading";
import { EmailUnsubscribe } from "@/components/evals/email-unsubscribe";
import { InvitationAcceptance } from "@/components/evals/invitation-acceptance";
import { LocaleSwitch } from "@/components/evals/locale";
import { PublicFrame } from "@/components/evals/public-frame";
import { ReportView, SharedReport } from "@/components/evals/report-view";
import { EvaluationResetPassword } from "@/components/evals/reset-password";
import { SelfServeSignup } from "@/components/evals/self-serve-signup";
import { EvaluationSignIn } from "@/components/evals/sign-in";
import { SignupStart } from "@/components/evals/signup-start";
import { TwoFactorSettings } from "@/components/evals/two-factor-settings";
import { VendorFixList, VendorFixListPage } from "@/components/evals/vendor-fix-list";
import { buildExampleBundle } from "@/lib/evals/example/build";
import { evalsClientMessages, type EvalsClientScope } from "@/lib/evals/messages/client-messages";
import { messages } from "@/lib/evals/messages/en";
import { es } from "@/lib/evals/messages/es";
import { registerCatalogues, resetMessagesForTests, setLocale, type Locale } from "@/lib/evals/messages/runtime";
import { projectFixList } from "@/lib/evals/reports/fix-list-share";
import { entryKeys, EVALS_CLIENT_ENTRIES, generate } from "@/scripts/i18n/evals-client-keys";

const ROOT = path.resolve(__dirname, "../..");
const Frame = PublicFrame as FunctionComponent<{ contextKey: "invitations" | "sharedPrivately"; children?: ReactNode }>;
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

let missing: string[] = [];
beforeEach(() => {
  missing = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const message = String(args[0]);
    if (message.startsWith("Missing evals message")) missing.push(message);
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  // Leave the full catalogues for the suites that run after this one.
  registerCatalogues(messages, es);
  setLocale("en");
});

/** The browser's state for a page: only what the layout and the page send. */
function asBrowser(locale: Locale, scope: EvalsClientScope) {
  resetMessagesForTests({ [locale]: evalsClientMessages(locale, scope === "shell" ? ["shell"] : ["shell", scope]) });
  setLocale(locale);
}
const html = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));

describe("evaluation app messages in the browser (L-24c)", () => {
  it("the generated key lists are up to date (npm run i18n:evals-client-keys)", () => {
    expect(generate()).toBe(read("lib/evals/messages/client-keys.ts"));
  });

  it("no browser code imports the catalogues or reads a message when its module loads", () => {
    const clientFiles = (dir: string): string[] =>
      readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const file = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) return clientFiles(file);
        return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && /^["']use client["']/.test(read(file)) ? [file] : [];
      });
    const roots = [...clientFiles("components/evals"), ...clientFiles("app/(evaluation)")];
    const { modules } = entryKeys({ files: roots });
    const problems: string[] = [];
    for (const file of modules) {
      const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && /messages\/(en|es)$/.test(statement.moduleSpecifier.text) && !statement.importClause?.isTypeOnly) {
          const named = statement.importClause?.namedBindings;
          const typeOnly = !!named && ts.isNamedImports(named) && named.elements.every((element) => element.isTypeOnly);
          if (!typeOnly) problems.push(`${file} imports ${statement.moduleSpecifier.text}`);
        }
      }
      const visit = (node: ts.Node, inFunction: boolean) => {
        const inside = inFunction || ts.isFunctionLike(node) || ts.isClassLike(node);
        if (!inside && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["t", "tv"].includes(node.expression.text)) {
          problems.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} calls ${node.expression.text}() at module scope`);
        }
        ts.forEachChild(node, (child) => visit(child, inside));
      };
      visit(source, false);
    }
    expect(problems).toEqual([]);
    expect(modules.length).toBeGreaterThan(80);
  });

  it("every page outside the signed-in app has an entry", () => {
    const pages = (dir: string): string[] =>
      readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const file = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === "(authenticated)" ? [] : pages(file);
        return entry.name === "page.tsx" ? [file] : [];
      });
    const covered = new Set<string>(Object.values(EVALS_CLIENT_ENTRIES).flatMap((entry) => entry.files));
    // The entry page only redirects.
    const uncovered = pages("app/(evaluation)").filter((file) => !covered.has(file) && file !== "app/(evaluation)/evaluation-entry/page.tsx");
    expect(uncovered).toEqual([]);
    for (const [scope, entry] of Object.entries(EVALS_CLIENT_ENTRIES)) {
      if (scope === "shell") continue;
      for (const file of entry.files) expect(read(file), file).toContain(`evalsPageMessages(["${scope}"])`);
    }
  });

  it("sends one language, and little of it before sign-up", () => {
    const start = evalsClientMessages("es", ["shell", "workspace/start"]);
    expect(start.startTitle).toBe(es.startTitle);
    expect(Object.values(start)).not.toContain(messages.startTitle);
    expect(JSON.stringify(start).length).toBeLessThan(8_000);
    expect(Object.keys(evalsClientMessages("es", "all"))).toHaveLength(Object.keys(messages).length);
  });

  for (const locale of ["en", "es"] as const) {
    describe(locale, () => {
      it("frame: error, loading and the language menu", () => {
        asBrowser(locale, "shell");
        html([createElement(EvaluationError, { key: 1, reset() {} }), createElement(EvaluationLoading, { key: 2 }), createElement(LocaleSwitch, { key: 3 })]);
        expect(missing).toEqual([]);
      });

      it("sign-in", () => {
        asBrowser(locale, "workspace/sign-in");
        html([createElement(EvaluationSignIn, { key: 1, directSignup: true }), createElement(EvaluationSignIn, { key: 2, next: "/workspace/reports" })]);
        expect(missing).toEqual([]);
      });

      it("direct sign-up", () => {
        asBrowser(locale, "workspace/start");
        expect(html(createElement(SignupStart, { marketingOrigin: "https://caudals.com" }))).toContain(locale === "es" ? es.startTitle : messages.startTitle);
        expect(missing).toEqual([]);
      });

      it("sign-up from the emailed link", () => {
        asBrowser(locale, "workspace/signup");
        html([true, false].map((directSignup) => createElement(SelfServeSignup, { key: String(directSignup), termsRequired: true, directSignup, onboarding: true, marketingOrigin: "https://caudals.com" })));
        expect(missing).toEqual([]);
      });

      it("password reset", () => {
        asBrowser(locale, "workspace/reset-password");
        html([createElement(EvaluationResetPassword, { key: 1, token: "x" }), createElement(EvaluationResetPassword, { key: 2, invalid: true }), createElement(EvaluationResetPassword, { key: 3 })]);
        expect(missing).toEqual([]);
      });

      it("invitation without an account", () => {
        asBrowser(locale, "workspace/invitations");
        html(createElement(Frame, { contextKey: "invitations" }, createElement(InvitationAcceptance, { authenticated: false })));
        expect(missing).toEqual([]);
      });

      it("unsubscribe", () => {
        asBrowser(locale, "workspace/unsubscribe");
        html(createElement(EmailUnsubscribe));
        expect(missing).toEqual([]);
      });

      it("two-factor set-up", () => {
        asBrowser(locale, "workspace/security");
        html([false, true].map((enabled) => createElement(TwoFactorSettings, { key: String(enabled), email: "a@example.com", enabled, required: !enabled, staff: true, next: "/workspace/evaluations" })));
        expect(missing).toEqual([]);
      });

      it("shared report, loading and loaded", () => {
        asBrowser(locale, "share");
        const report = buildExampleBundle(locale).runs[2];
        html([
          createElement(Frame, { key: 1, contextKey: "sharedPrivately" }, createElement(SharedReport, { marketingOrigin: "https://caudals.com" })),
          ...(["overview", "findings", "results", "improvements", "methodology"] as const).map((tab) => createElement(ReportView, { key: tab, report, initialTab: tab })),
        ]);
        expect(missing).toEqual([]);
      });

      it("vendor fix list, loading and loaded", () => {
        asBrowser(locale, "share/fixes");
        const data = projectFixList(buildExampleBundle(locale).runs[2]);
        html([
          createElement(VendorFixListPage, { key: 1 }),
          createElement(VendorFixList, { key: 2, data, expiresAt: "2026-12-01T00:00:00Z", referral: null, marketingOrigin: "https://caudals.com" }),
        ]);
        expect(missing).toEqual([]);
      });
    });
  }
});
