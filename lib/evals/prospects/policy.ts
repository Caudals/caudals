/**
 * Prospect snapshots (launch L-21, spec v2 P-35; evals spec §16.5): the
 * third-party policy as pure rules. An operator tests a company's public chat
 * with ordinary questions drawn from its public help centre, within traffic
 * limits, with the testing basis recorded, and shares the result privately
 * with that company only. Never adversarial, never public, never sent
 * automatically. Migration 090 enforces the same rules in the database.
 */
import { DOMAIN_PACKS } from "../generation/pack-registry";

/** Packs a snapshot may use: ordinary grounded questions only. */
export const SNAPSHOT_PACKS = ["generic-grounded-qa"] as const;
/** Task types a snapshot test set may contain. */
export const SNAPSHOT_TASK_TYPES = ["grounded_qa"] as const;
/** Anything that looks like an attack on the system rather than a customer question. */
export const ADVERSARIAL_PATTERN = /adversar|prompt[\s_-]*inject|jailbreak|prompt[\s_-]*(extract|leak)|system[\s_-]*prompt|exfiltrat|red[\s_-]*team/i;

export const SNAPSHOT_SHARE_DAYS = 30;
export const TESTING_BASES = ["public_information", "owner_permission"] as const;
export type TestingBasis = (typeof TESTING_BASES)[number];

export type SnapshotLimits = {
  dailyCap: number;
  maxQuestions: number;
  requestsPerMinute: number;
  concurrentSessions: 1;
  runsPerMonth: number;
  helpPages: number;
};

/** Limits from the environment, clamped to what migration 090 accepts. */
export function snapshotLimits(env: Record<string, string | undefined> = process.env): SnapshotLimits {
  const int = (value: string | undefined, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  return {
    dailyCap: int(env.PROSPECT_SNAPSHOT_DAILY_CAP, 25, 1, 200),
    maxQuestions: int(env.PROSPECT_SNAPSHOT_MAX_QUESTIONS, 10, 1, 20),
    requestsPerMinute: 4,
    concurrentSessions: 1,
    runsPerMonth: 3,
    helpPages: 10,
  };
}

export type PolicyCheck = { allowed: boolean; reasons: string[] };

/**
 * The policy check for a snapshot's question pack and test set. A pack that
 * is not on the ordinary list, or that names any adversarial technique, is
 * blocked; so is any case that is not an ordinary grounded question.
 */
export function checkSnapshotPolicy(input: {
  packId: string;
  cases?: Array<{ task_type?: string; tags?: string[]; title?: string; scenario?: { mode?: string } }>;
}): PolicyCheck {
  const reasons: string[] = [];
  const pack = DOMAIN_PACKS.find((item) => item.id === input.packId);
  if (ADVERSARIAL_PATTERN.test(input.packId) || (pack && ADVERSARIAL_PATTERN.test(`${pack.title} ${pack.summary} ${pack.taskTypes.join(" ")}`))) {
    reasons.push("adversarial_pack");
  } else if (!(SNAPSHOT_PACKS as readonly string[]).includes(input.packId) || !pack || pack.status !== "active") {
    reasons.push("pack_not_allowed");
  } else if (pack.taskTypes.some((type) => !(SNAPSHOT_TASK_TYPES as readonly string[]).includes(type))) {
    reasons.push("task_type_not_allowed");
  }
  for (const item of input.cases ?? []) {
    if (!(SNAPSHOT_TASK_TYPES as readonly string[]).includes(item.task_type ?? "")) reasons.push("task_type_not_allowed");
    if (item.scenario?.mode === "tool_workflow") reasons.push("task_type_not_allowed");
    if ((item.tags ?? []).some((tag) => ADVERSARIAL_PATTERN.test(tag))) reasons.push("adversarial_case");
  }
  const unique = [...new Set(reasons)];
  return { allowed: unique.length === 0, reasons: unique };
}

/** Host names that are not a public internet site. */
function privateHost(host: string) {
  if (/^\[|^[0-9.]+$/.test(host)) return true; // IP literals: v6 in brackets, or dotted v4
  if (!host.includes(".")) return true;
  return /(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|example|invalid|onion)$/i.test(host);
}

/**
 * A public HTTPS page without credentials, a non-standard port or a private
 * host. Query and fragment are dropped: the chat endpoint and the help-centre
 * start page are plain pages.
 */
export function publicUrl(raw: string): { url: string; host: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host.length > 253 || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host) || privateHost(host)) return null;
  url.search = "";
  url.hash = "";
  url.hostname = host;
  return { url: url.href, host };
}

/** The Europe/Madrid calendar day of an instant (the daily cap's day). */
export function madridDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** When a snapshot link made now expires. */
export function snapshotShareExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SNAPSHOT_SHARE_DAYS * 24 * 3600_000);
}

/** The approved scope recorded with every snapshot (and checked by migration 090). */
export function snapshotScope(input: { packId: string; maxQuestions: number }) {
  return {
    questions: "ordinary",
    information: "public",
    adversarial: false,
    pack: input.packId,
    max_questions: input.maxQuestions,
    sharing: "private_link",
    public_naming: false,
    no_bypass: ["authentication", "captcha", "rate_limits"],
  } as const;
}

/* --------------------------------------------------------- outreach --- */

export type SnapshotMetrics = { scored: number; pass: number; partial: number; fail: number };
export type OutreachDraft = { linkedin: string; emailSubject: string; emailBody: string };

/** Read the counts the outreach needs from a report snapshot's metrics. */
export function snapshotMetrics(metrics: Record<string, unknown> | null | undefined): SnapshotMetrics | null {
  if (!metrics) return null;
  const n = (key: string) => (typeof metrics[key] === "number" && Number.isFinite(metrics[key]) ? (metrics[key] as number) : 0);
  const scored = n("n_scorable");
  if (!scored) return null;
  return { scored, pass: n("n_pass"), partial: n("n_partial"), fail: n("n_fail") };
}

/**
 * Weak evidence is not sent (spec §7.5): fewer than five scored answers, or
 * nothing to show (no wrong or incomplete answer).
 */
export function weakEvidence(metrics: SnapshotMetrics | null) {
  return !metrics || metrics.scored < 5 || metrics.fail + metrics.partial === 0;
}

/**
 * The §7.5 message templates, filled with the snapshot's counts, for the
 * operator to edit. {name} stays a placeholder; {link} is replaced by the
 * private link when the operator has it. The scope line describes the
 * evidence accurately (evals spec §16.5): ordinary questions on the public
 * chat, public information, unknown configuration.
 */
export function outreachDrafts(input: { company: string; metrics: SnapshotMetrics | null; finding?: string | null; link?: string | null }): Record<"en" | "es", OutreachDraft> {
  const company = input.company.trim();
  const link = input.link?.trim() || "{link}";
  const m = input.metrics ?? { scored: 0, pass: 0, partial: 0, fail: 0 };
  const finding = input.finding?.trim().replace(/\s+/g, " ").slice(0, 140) || null;
  const enCounts = `${m.pass} right, ${m.partial} incomplete and ${m.fail} wrong`;
  const esCounts = `${m.pass} bien, ${m.partial} incompletas y ${m.fail} incorrectas`;
  const enScope = "It's an external snapshot: ordinary questions on your public chat, using public information only, so I don't know how your system is configured.";
  const esScope = "Es una prueba externa: preguntas normales en vuestro chat público, solo con información pública, así que no sé cómo está configurado vuestro sistema.";
  const en: OutreachDraft = {
    linkedin: `Hi {name}, I tested ${company}'s assistant with ${m.scored} questions taken from your own help centre. ${enCounts}${finding ? ` (for example: "${finding}")` : ""}. Private report, valid for 30 days: ${link}. ${enScope} Worth 20 minutes to show you what I'd fix first?`,
    emailSubject: m.fail > 0 ? `${company}: one of your assistant's answers contradicts your own site` : `${company}: ${m.pass} of ${m.scored} answers from your assistant checked against your help centre`,
    emailBody: [
      "Hi {name},",
      "",
      `I asked ${company}'s public assistant ${m.scored} ordinary questions taken from your help centre: ${enCounts}.${finding ? ` One example: "${finding}".` : ""}`,
      `Private report, valid for 30 days: ${link}`,
      enScope,
      "",
      "Caudals · caudals.com",
      "If you'd rather not hear from us, reply \"no\" and we won't write again.",
    ].join("\n"),
  };
  const es: OutreachDraft = {
    linkedin: `Hola {nombre}: he probado el asistente de ${company} con ${m.scored} preguntas sacadas de vuestro propio centro de ayuda. ${esCounts}${finding ? ` (por ejemplo: «${finding}»)` : ""}. Informe privado, válido 30 días: ${link}. ${esScope} ¿Te enseño en 20 minutos qué arreglaría primero?`,
    emailSubject: m.fail > 0 ? `${company}: una respuesta de vuestro asistente contradice vuestra web` : `${company}: ${m.pass} de ${m.scored} respuestas de vuestro asistente comprobadas con vuestro centro de ayuda`,
    emailBody: [
      "Hola {nombre}:",
      "",
      `He hecho ${m.scored} preguntas normales al asistente público de ${company}, sacadas de vuestro centro de ayuda: ${esCounts}.${finding ? ` Un ejemplo: «${finding}».` : ""}`,
      `Informe privado, válido 30 días: ${link}`,
      esScope,
      "",
      "Caudals · caudals.com",
      "Si prefieres que no te escribamos más, responde «no» y no volveremos a hacerlo.",
    ].join("\n"),
  };
  return { en, es };
}

/** Never store a bearer link: replace any private share URL with the placeholder. */
export function scrubShareLinks(text: string) {
  return text.replace(/https?:\/\/[^\s"'<>]*\/share#token=[A-Za-z0-9_-]+/g, "{link}");
}
