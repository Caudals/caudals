"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { useLocale, useTranslations } from "@/lib/i18n/context";
import type { NamespaceKeys } from "@/lib/i18n/messages";
import { splitMarked } from "@/lib/marked-text";
import type { DemoView } from "@/lib/demo/view";
import type { Verdict } from "@/lib/demo/judge";
import { solveChallenge } from "./pow";
import { VerdictMark } from "./verdict";
import { plainAnswer, RichAnswer } from "./answer-text";
import "./demo.css";

type Key = NamespaceKeys<"demo">;
type Challenge = { salt: string; bits: number; expires: number; signature: string };
type Intro = {
  open: boolean;
  reason: string | null;
  challenge: Challenge | null;
  last: { id: string; token: string; host: string; phase: string; createdAt: string } | null;
};
type Handle = { id: string; token: string };

const TERMINAL = new Set(["done", "failed"]);

/** `#r=<id>.<token>`: the private link to one run. The token never reaches a server log or a referrer. */
function readHandle(): Handle | null {
  if (typeof window === "undefined") return null;
  const match = /^#r=([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/.exec(window.location.hash);
  return match ? { id: match[1], token: match[2] } : null;
}

function hostOf(value: string) {
  try { return new URL(/^[a-z]+:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** What the visitor pasted, for the live hint: a page, an OpenAI-style API or a curl command. */
function kindOf(value: string): "website" | "openai" | "curl" | null {
  const text = value.trim();
  if (!text) return null;
  if (/^curl\s/i.test(text)) return "curl";
  if (!hostOf(text).includes(".")) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
    return /\/(v\d+\/)?(chat\/)?completions\/?$|\/v\d+\/?$|\/openai\/?$/i.test(url.pathname) ? "openai" : "website";
  } catch { return null; }
}

export function DemoPage() {
  const t = useTranslations("demo");
  const [handle, setHandle] = useState<Handle | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => { setHandle(readHandle()); setReady(true); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const open = useCallback((next: Handle | null) => {
    window.history.replaceState(null, "", next ? `#r=${next.id}.${next.token}` : window.location.pathname);
    setHandle(next);
    window.scrollTo({ top: 0 });
  }, []);

  const headline = splitMarked(t("headline"));
  return (
    <div className="lp-wrap">
      <div className="dm">
        {!ready ? null : handle ? (
          <RunView handle={handle} onReset={() => open(null)} />
        ) : (
          <>
            <h1 className="dm-h1 lp-rise">
              {headline.before}
              {headline.marked ? <em>{headline.marked}</em> : null}
              {headline.after}
            </h1>
            <p className="dm-sub lp-rise" style={{ ["--d" as string]: 0.06 }}>{t("subtitle")}</p>
            <StartForm onStarted={open} />
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ start --- */

function StartForm({ onStarted }: { onStarted: (handle: Handle) => void }) {
  const t = useTranslations("demo");
  const locale = useLocale();
  const ids = useId();
  const [intro, setIntro] = useState<Intro | null>(null);
  const [target, setTarget] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [docs, setDocs] = useState("");
  const [docsOpen, setDocsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ code: string; host?: string } | null>(null);
  const solution = useRef<{ challenge: Challenge; nonce: Promise<string> } | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const loadChallenge = useCallback(async () => {
    try {
      const response = await fetch("/api/demo/challenge", { cache: "no-store" });
      const data = (await response.json()) as Intro;
      setIntro(data);
      if (data.challenge) {
        const nonce = solveChallenge(data.challenge.salt, data.challenge.bits);
        nonce.catch(() => {});
        solution.current = { challenge: data.challenge, nonce };
      }
    } catch {
      setIntro({ open: false, reason: "closed", challenge: null, last: null });
    }
  }, []);
  useEffect(() => { void loadChallenge(); }, [loadChallenge]);

  // The field grows with a pasted curl command.
  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 240)}px`;
  }, [target]);

  const kind = kindOf(target);
  const host = hostOf(target);
  const needsDocs = kind === "openai" || kind === "curl";
  const showDocs = needsDocs || docsOpen;
  const closed = intro !== null && !intro.open;
  const canSubmit = Boolean(kind) && !pending && !closed && (!needsDocs || hostOf(docs).includes(".")) && (kind !== "openai" || model.trim().length > 0);

  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (!canSubmit || !solution.current) return;
    setPending(true);
    setError(null);
    try {
      const { challenge, nonce } = solution.current;
      const response = await fetch("/api/demo/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target: target.trim(),
          ...(showDocs && docs.trim() ? { docs: docs.trim() } : {}),
          ...(kind === "openai" ? { model: model.trim(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) } : {}),
          locale,
          challenge,
          nonce: await nonce,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.id && data.token) {
        setApiKey("");
        onStarted({ id: data.id, token: data.token });
        return;
      }
      setError({ code: data?.error?.code ?? "generic", host: host || hostOf(docs) });
      // Every attempt spends its challenge; fetch the next one.
      void loadChallenge();
    } catch {
      setError({ code: "generic" });
      void loadChallenge();
    } finally {
      setPending(false);
    }
  }

  const hint = !kind ? t("hintEmpty") : kind === "website" ? t("hintWebsite", { host }) : kind === "openai" ? t("hintOpenai") : t("hintCurl");

  return (
    <form className="dm-form lp-rise" style={{ ["--d" as string]: 0.12 }} onSubmit={submit} noValidate>
      {intro?.last ? (
        <p className="dm-last">
          {t("lastRun", { host: intro.last.host })}{" "}
          <button type="button" className="dm-link" onClick={() => onStarted({ id: intro.last!.id, token: intro.last!.token })}>{t("lastRunOpen")}</button>
        </p>
      ) : null}

      <label htmlFor={`${ids}-target`} className="dm-label">{t("targetLabel")}</label>
      <div className="dm-bar">
        <textarea
          id={`${ids}-target`}
          ref={field}
          className="dm-input"
          rows={1}
          value={target}
          placeholder={t("targetPlaceholder")}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="url"
          aria-describedby={`${ids}-hint`}
          onChange={(event) => { setTarget(event.target.value); setError(null); }}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !/^curl\s/i.test(target)) { event.preventDefault(); void submit(); } }}
        />
        <button type="submit" className="lp-btn dm-go" disabled={!canSubmit} aria-disabled={!canSubmit}>
          {pending ? t("starting") : t("start")}
          {!pending ? <span className="lp-arr" aria-hidden="true">→</span> : null}
        </button>
      </div>
      <p id={`${ids}-hint`} className="dm-hint">
        {hint}
        {kind === "website" && !docsOpen ? (
          <> <button type="button" className="dm-link" onClick={() => setDocsOpen(true)}>{t("docsChange")}</button></>
        ) : null}
      </p>

      {kind === "openai" ? (
        <div className="dm-pair">
          <div>
            <label htmlFor={`${ids}-model`} className="dm-label">{t("modelLabel")}</label>
            <input id={`${ids}-model`} className="dm-line" value={model} onChange={(event) => setModel(event.target.value)} placeholder={t("modelPlaceholder")} spellCheck={false} autoCapitalize="off" />
          </div>
          <div>
            <label htmlFor={`${ids}-key`} className="dm-label">{t("keyLabel")} <span className="dm-quiet">· {t("keyOptional")}</span></label>
            <input id={`${ids}-key`} className="dm-line" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" spellCheck={false} aria-describedby={`${ids}-keyhint`} />
            <p id={`${ids}-keyhint`} className="dm-hint">{t("keyHint")}</p>
          </div>
        </div>
      ) : null}

      {showDocs ? (
        <div className="dm-docs">
          <label htmlFor={`${ids}-docs`} className="dm-label">{t("docsLabel")}</label>
          <input id={`${ids}-docs`} className="dm-line" value={docs} onChange={(event) => setDocs(event.target.value)} placeholder={t("docsPlaceholder")} spellCheck={false} autoCapitalize="off" inputMode="url" />
        </div>
      ) : null}

      {error || closed ? (
        <p className="dm-error" role="alert">
          {errorText(t, error?.code ?? intro?.reason ?? "closed", error?.host)}
          {(error?.code ?? intro?.reason) === "capacity" || (error?.code ?? intro?.reason) === "closed" ? (
            <> <Link href="/call" className="dm-link">{t("upsell.callLink")}</Link></>
          ) : null}
        </p>
      ) : null}

      <Steps />
      <p className="dm-foot">{t("footnote")}</p>
    </form>
  );
}

function errorText(t: ReturnType<typeof useTranslations<"demo">>, code: string, host = "") {
  const normalized = code.startsWith("target_http_") ? "target_http"
    : code.startsWith("model_") || code === "engine_failed" ? "model"
    : code === "capacity" && host === "__run" ? "capacity_run"
    : code;
  const key = `errors.${normalized}` as Key;
  const text = t(key, { host: host || "—" });
  return text === `demo.${key}` ? t("errors.generic") : text;
}

/* ------------------------------------------------------------------ steps --- */

type StepState = "idle" | "active" | "done";
type StepRow = { key: "read" | "write" | "ask" | "check"; state: StepState; status: string };

function Steps({ rows }: { rows?: StepRow[] }) {
  const t = useTranslations("demo");
  const items: StepRow[] = rows ?? [
    { key: "read", state: "idle", status: t("steps.readIdle") },
    { key: "write", state: "idle", status: t("steps.writeIdle") },
    { key: "ask", state: "idle", status: t("steps.askIdle") },
    { key: "check", state: "idle", status: t("steps.checkIdle") },
  ];
  return (
    <ol className={`dm-steps${rows ? " is-live" : ""}`}>
      {items.map((item, index) => (
        <li key={item.key} className={`dm-step is-${item.state}`} aria-current={item.state === "active" ? "step" : undefined}>
          <span className="dm-num">{String(index + 1).padStart(2, "0")}</span>
          <span className="dm-step-title">{t(`steps.${item.key}` as Key)}</span>
          <span className="dm-step-status">
            {item.status}
            {item.state === "active" ? <span className="dm-caret" aria-hidden="true" /> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------- run --- */

function useRun(handle: Handle) {
  const [run, setRun] = useState<DemoView | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let stopped = false;
    let etag = "";
    let timer = 0;
    const started = Date.now();
    const poll = async () => {
      try {
        const response = await fetch(`/api/demo/runs/${handle.id}`, { headers: { "x-demo-token": handle.token, ...(etag ? { "if-none-match": etag } : {}) }, cache: "no-store" });
        if (stopped) return;
        if (response.status === 404) { setMissing(true); return; }
        if (response.ok) {
          etag = response.headers.get("etag") ?? "";
          const data = (await response.json()) as DemoView;
          setRun(data);
          if (TERMINAL.has(data.phase)) return;
        }
      } catch { /* keep polling through a blip */ }
      if (!stopped) timer = window.setTimeout(poll, Date.now() - started > 180_000 ? 2_000 : 1_000);
    };
    void poll();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [handle.id, handle.token]);
  return { run, missing };
}

function useElapsed(run: DemoView | null) {
  const [now, setNow] = useState(() => Date.now());
  const running = run && !TERMINAL.has(run.phase);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);
  if (!run) return "0:00";
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
  const seconds = Math.max(0, Math.round((end - Date.parse(run.createdAt)) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function RunView({ handle, onReset }: { handle: Handle; onReset: () => void }) {
  const t = useTranslations("demo");
  const { run, missing } = useRun(handle);
  const elapsed = useElapsed(run);

  const steps = useMemo<StepRow[] | null>(() => {
    if (!run) return null;
    const order = ["reading", "writing", "asking", "grading", "done"];
    const at = run.phase === "failed" ? -1 : order.indexOf(run.phase);
    const state = (index: number): StepState => (run.phase === "done" || at > index ? "done" : at === index ? "active" : "idle");
    const answered = run.cases.filter((item) => item.answer).length;
    const total = run.cases.length || 8;
    const findingChat = run.target.kind === "website" && !run.browser.chatFound && run.browser.chat !== "done" && answered === 0;
    return [
      { key: "read", state: state(0), status: state(0) === "done" ? t("steps.read_done", { count: run.pages.length }) : state(0) === "active" ? t("steps.reading", { host: run.docs.host }) : "" },
      { key: "write", state: findingChat && at === 1 ? "idle" : state(1), status: state(1) === "done" ? t("steps.write_done", { count: run.cases.length }) : state(1) === "active" && !findingChat ? t("steps.writing", { count: run.cases.length, total: 8 }) : "" },
      // Website runs find the chat while questions are written; show it as soon as it starts.
      { key: "ask", state: findingChat && at >= 0 && at < 2 ? "active" : state(2), status: state(2) === "done" ? t("steps.ask_done", { count: answered }) : state(2) === "active" || (findingChat && at >= 0 && at < 2) ? (findingChat ? t("steps.finding") : t("steps.asking", { count: answered, total })) : answered ? t("steps.asking", { count: answered, total }) : "" },
      { key: "check", state: state(3), status: state(3) === "done" ? t("steps.check_done") : state(3) === "active" ? t("steps.checking") : "" },
    ];
  }, [run, t]);

  const active = steps?.find((step) => step.state === "active");
  const announcement = active ? t("live.announceStep", { step: t(`steps.${active.key}` as Key), status: active.status }) : "";

  if (missing) {
    return (
      <div className="dm-failed">
        <p className="dm-error" role="alert">{t("errors.not_found")}</p>
        <button type="button" className="lp-btn" onClick={onReset}>{t("errors.retry")}</button>
      </div>
    );
  }
  if (!run || !steps) return <p className="dm-eyebrow" aria-busy="true">…</p>;

  return (
    <>
      {run.phase === "done" ? (
        <p className="dm-eyebrow">
          <span>{run.target.host}</span>
          <span className="dm-clock" aria-label={t("live.elapsed")}>{elapsed}</span>
        </p>
      ) : (
        <div className="dm-runhead">
          <h1 className="dm-h2">{t("live.eyebrow", { host: run.target.host })}</h1>
          <span className="dm-clock" aria-label={t("live.elapsed")}>{elapsed}</span>
        </div>
      )}
      {run.phase === "done" && run.summary ? <Score run={run} /> : null}
      {run.phase === "failed" ? (
        <div className="dm-failed">
          <p className="dm-error" role="alert">{errorText(t, run.error ?? "generic", run.error === "capacity" ? "__run" : run.error?.startsWith("site") || run.error === "unreachable" || run.error === "timeout" ? run.docs.host : run.target.host)}</p>
          <button type="button" className="lp-btn" onClick={onReset}>
            {t(run.error === "interrupted" ? "errors.again" : "errors.retry")}
            <span className="lp-arr" aria-hidden="true">→</span>
          </button>
        </div>
      ) : null}
      {run.phase !== "done" && run.phase !== "failed" ? <Steps rows={steps} /> : null}
      <p className="sr-only" aria-live="polite">{announcement}</p>
      {run.cases.length ? <Ledger run={run} /> : null}
      {run.phase === "done" ? <Upsell run={run} handle={handle} /> : null}
    </>
  );
}

/* ----------------------------------------------------------------- report --- */

function Score({ run }: { run: DemoView }) {
  const t = useTranslations("demo");
  const locale = useLocale();
  const summary = run.summary!;
  const [copied, setCopied] = useState(false);
  const misled = summary.incorrect;
  const incomplete = summary.partial + summary.no_answer;
  const lines = summary.scored === 0 ? [t("report.noneScored")]
    : summary.correct === summary.scored ? [t("report.allRight")]
    : [
        misled ? (misled === 1 ? t("report.misledOne") : t("report.misled", { count: misled })) : "",
        incomplete ? (incomplete === 1 ? t("report.incompleteOne") : t("report.incomplete", { count: incomplete })) : "",
      ].filter(Boolean);
  const causes = Object.entries(summary.causes).filter(([, count]) => count).sort((a, b) => b[1] - a[1]);
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(run.createdAt));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch { /* clipboard blocked: the address bar still has the link */ }
  };

  return (
    <section className="dm-score" aria-labelledby="dm-score-title">
      <h1 id="dm-score-title" className="dm-score-line">
        <span className="dm-score-n">{summary.correct}</span>
        <span className="dm-score-of">{t("report.scoreOf", { total: summary.scored })}</span>
        <span className="dm-score-label">{t("report.scoreLabel")}</span>
      </h1>
      <p className="dm-verdict-line">{lines.join(" ")}</p>
      {summary.unscored ? <p className="dm-hint">{t("report.unscoredNote", { count: summary.unscored })}</p> : null}
      {causes.length ? (
        <div className="dm-causes">
          <h2 className="dm-label">{t("report.whereTitle")}</h2>
          <ul>
            {causes.map(([cause, count]) => (
              <li key={cause}><span>{t(`cause.${cause}` as Key)}</span><span className="dm-count">{count}</span></li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="dm-meta">
        <span>{t("report.meta", { host: run.docs.host, date, count: run.cases.length, pages: run.pages.length })}</span>
        <button type="button" className="dm-link" onClick={copy} aria-live="polite">{copied ? t("report.copied") : t("report.copyLink")}</button>
      </p>
    </section>
  );
}

function Ledger({ run }: { run: DemoView }) {
  const t = useTranslations("demo");
  const done = run.phase === "done";
  const failed = run.phase === "failed";
  const askingNow = !failed && (run.phase === "asking" || (run.target.kind === "website" && run.browser.chatFound && run.browser.chat === "running"));
  const firstUnanswered = run.cases.find((item) => !item.answer)?.id;
  return (
    <ol className="dm-ledger">
      {run.cases.map((item, index) => {
        const verdict = item.verdict?.verdict as Verdict | undefined;
        const status = verdict ? t(`verdict.${verdict}` as Key)
          : item.answer ? (item.answer.error ? t("live.noReply") : t("live.answered"))
          : failed ? "" : askingNow && item.id === firstUnanswered ? t("live.asking") : t("live.waiting");
        const page = run.pages[item.page];
        const head = (
          <>
            <span className="dm-num">{String(index + 1).padStart(2, "0")}</span>
            <span className="dm-q">{item.question}</span>
            <span className={`dm-status${verdict ? ` is-${verdict}` : item.answer ? " is-answered" : askingNow && item.id === firstUnanswered ? " is-asking" : ""}`}>
              {verdict ? <VerdictMark verdict={verdict} /> : null}
              <span>{status}</span>
            </span>
          </>
        );
        const answer = item.answer && item.answer.text ? <p className="dm-a">{plainAnswer(item.answer.text)}</p> : null;
        if (!done) {
          return (
            <li key={item.id} className="dm-row">
              <div className="dm-row-head">{head}</div>
              {answer}
            </li>
          );
        }
        return (
          <li key={item.id} className="dm-row">
            <details className="dm-detail">
              <summary className="dm-row-head">{head}</summary>
              <dl className="dm-facts">
                <div><dt>{t("report.answer")}</dt><dd>{item.answer?.text ? <RichAnswer text={item.answer.text} /> : "—"}</dd></div>
                <div><dt>{t("report.expected")}</dt><dd>{item.expected}</dd></div>
                {item.verdict?.note ? <div><dt>{t("report.why")}</dt><dd>{item.verdict.note}</dd></div> : null}
                <div>
                  <dt>{t("report.source")}</dt>
                  <dd>
                    <blockquote className="dm-quote">{item.quote}</blockquote>
                    {page ? <a className="dm-src" href={page.url} target="_blank" rel="noopener noreferrer">{page.title || hostOf(page.url)}</a> : null}
                  </dd>
                </div>
              </dl>
            </details>
            {answer}
          </li>
        );
      })}
    </ol>
  );
}

function Upsell({ run, handle }: { run: DemoView; handle: Handle }) {
  const t = useTranslations("demo");
  const ids = useId();
  const card = useRef<HTMLElement>(null);
  const emailField = useRef<HTMLInputElement>(null);
  // The bar leads to the card and steps aside once the card is on screen.
  const [cardVisible, setCardVisible] = useState(false);
  useEffect(() => {
    const node = card.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setCardVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const goToCard = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    window.setTimeout(() => emailField.current?.focus({ preventScroll: true }), reduce ? 0 : 450);
  };
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const title = splitMarked(t("upsell.title"));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const response = await fetch(`/api/demo/runs/${run.id}/signup`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-demo-token": handle.token },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (response.ok) { setState("sent"); return; }
      const data = await response.json().catch(() => ({}));
      setError(data?.error?.code ?? "signup_unavailable");
      setState("idle");
    } catch {
      setError("signup_unavailable");
      setState("idle");
    }
  }

  return (
    <>
    <section ref={card} id="account" className="dm-upsell" aria-labelledby={`${ids}-title`}>
      <div>
        <h2 id={`${ids}-title`} className="dm-upsell-h">
          {title.before}{title.marked ? <em>{title.marked}</em> : null}{title.after}
        </h2>
        <p className="dm-upsell-p">{t("upsell.body")}</p>
        <ul className="dm-list">
          <li>{t("upsell.item1")}</li>
          <li>{t("upsell.item2")}</li>
          <li>{t("upsell.item3")}</li>
          <li>{t("upsell.item4")}</li>
        </ul>
      </div>
      <div className="dm-upsell-form">
        {state === "sent" ? (
          <p className="dm-sent" role="status">{t("upsell.sent", { email: email.trim() })}</p>
        ) : (
          <form onSubmit={submit} noValidate>
            <label htmlFor={`${ids}-email`} className="dm-label">{t("upsell.emailLabel")}</label>
            <input ref={emailField} id={`${ids}-email`} className="dm-line" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("upsell.emailPlaceholder")} />
            {error ? <p className="dm-error" role="alert">{errorText(t, error)}</p> : null}
            <button type="submit" className="lp-btn dm-block" disabled={state === "sending" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}>
              {state === "sending" ? t("upsell.sending") : t("upsell.submit")}
              {state !== "sending" ? <span className="lp-arr" aria-hidden="true">→</span> : null}
            </button>
          </form>
        )}
        <p className="dm-hint">{t("upsell.call")} <Link href="/call" className="dm-link">{t("upsell.callLink")}</Link></p>
      </div>
    </section>
    {state !== "sent" ? (
      <div className={`dm-dock${cardVisible ? " is-hidden" : ""}`} aria-hidden={cardVisible}>
        <div className="dm-dock-inner">
          <p className="dm-dock-text">{t("upsell.dock")}</p>
          <button type="button" className="lp-btn dm-dock-btn" onClick={goToCard} tabIndex={cardVisible ? -1 : 0}>
            {t("upsell.submit")}
            <span className="lp-arr" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    ) : null}
    </>
  );
}
