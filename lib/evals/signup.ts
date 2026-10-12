import "server-only";
import { randomBytes } from "node:crypto";
import { recordProductEvent } from "@/lib/analytics/funnel-events-server";
import { sanitizeAttribution, type Attribution } from "@/lib/analytics/events";
import { getPostgresPool } from "@/lib/db/client";
import { sha256 } from "@/lib/demo/client";
import { getRun } from "@/lib/demo/store";
import { registrable } from "@/lib/demo/web";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { getResendClient } from "@/lib/resend/client";

/**
 * Self-serve sign-up links (docs/ARCHITECTURE.md → Public demo, Direct
 * sign-up). Both paths store a one-time link through
 * `evals.request_self_serve_signup` (only its sha256, two days, single use)
 * and finish on `/workspace/signup` with the same free-plan enrollment:
 * - from a finished public demo (`requestSignup`), which imports the demo;
 * - directly with a work email from `/workspace/start` (`requestDirectSignup`,
 *   launch L-05), under the one-workspace-per-domain rule.
 */

/** Direct work-email sign-up (launch L-05). Read on the server at request time; off unless `SELF_SERVE_DIRECT_SIGNUP=true`. */
export function directSignupEnabled(env: Record<string, string | undefined> = process.env) {
  return env.SELF_SERVE_DIRECT_SIGNUP === "true";
}

/** Where accounts live. The marketing host's NEXT_PUBLIC_APP_URL points at caudals.com, so it is not used here. */
export function appOrigin() {
  const configured = process.env.DEMO_APP_ORIGIN?.trim() || process.env.BETTER_AUTH_URL?.trim();
  if (configured) return new URL(configured).origin;
  return process.env.NODE_ENV === "production" ? "https://app.caudals.com" : "http://localhost:3000";
}

export function workspaceNameFor(host: string, company?: string) {
  const name = company?.trim();
  if (name) return name.slice(0, 160);
  const domain = registrable(host);
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

const COPY = {
  en: {
    subject: "Finish creating your Caudals account",
    body: (link: string) => `Open this link to choose a password and see your demo in your own workspace:\n\n${link}\n\nThe link works once and expires in two days. If you did not ask for it, ignore this email.`,
    existingSubject: "You already have a Caudals account",
    existing: (link: string) => `Someone (probably you) asked to create a Caudals account with this address, but one already exists. Sign in here:\n\n${link}\n\nIf it was not you, ignore this email.`,
    directSubject: "Finish creating your Caudals workspace",
    direct: (link: string) => `Open this link to choose a password and open your free Caudals workspace:\n\n${link}\n\nThe link works once and expires in two days. If you did not ask for it, ignore this email.`,
    takenSubject: "Your company already has a Caudals workspace",
    taken: (domain: string) => `Someone (probably you) asked to create a Caudals workspace with this address. A free workspace already exists for ${domain}, and each company has one.\n\nAsk its owner to invite you: they can do it from Settings → Members. If you need a separate workspace, write to hello@caudals.com.\n\nIf it was not you, ignore this email.`,
  },
  es: {
    subject: "Termina de crear tu cuenta de Caudals",
    body: (link: string) => `Abre este enlace para elegir una contraseña y ver tu demo en tu propio espacio de trabajo:\n\n${link}\n\nEl enlace sirve una sola vez y caduca en dos días. Si no lo has pedido tú, ignora este correo.`,
    existingSubject: "Ya tienes una cuenta de Caudals",
    existing: (link: string) => `Alguien (probablemente tú) ha pedido crear una cuenta de Caudals con esta dirección, pero ya existe. Entra aquí:\n\n${link}\n\nSi no has sido tú, ignora este correo.`,
    directSubject: "Termina de crear tu espacio de Caudals",
    direct: (link: string) => `Abre este enlace para elegir una contraseña y abrir tu espacio de trabajo gratuito de Caudals:\n\n${link}\n\nEl enlace sirve una sola vez y caduca en dos días. Si no lo has pedido tú, ignora este correo.`,
    takenSubject: "Tu empresa ya tiene un espacio de Caudals",
    taken: (domain: string) => `Alguien (probablemente tú) ha pedido crear un espacio de trabajo de Caudals con esta dirección. Ya existe un espacio gratuito para ${domain}, y cada empresa tiene uno.\n\nPide a su propietario que te invite: puede hacerlo desde Ajustes → Miembros. Si necesitas un espacio aparte, escríbenos a hello@caudals.com.\n\nSi no has sido tú, ignora este correo.`,
  },
};

async function send(to: string, message: { subject: string; text: string }) {
  const from = getSecretEnvValue("RESEND_FROM_EMAIL");
  if (!from) throw new Error("email_unconfigured");
  await getResendClient().emails.send({ from, to, subject: message.subject, text: message.text });
}

/**
 * Records a sign-up link for a finished demo and emails it. The response never
 * says whether the address already has an account; the email does.
 */
export async function requestSignup(input: { email: string; company?: string; runId: string; host: string; locale: "en" | "es" }) {
  const token = randomBytes(32).toString("base64url");
  const { rows } = await getPostgresPool().query<{ existing: boolean }>(
    "SELECT evals.request_self_serve_signup($1, $2, $3, $4, $5) AS existing",
    [sha256(token), input.email.trim().toLowerCase(), workspaceNameFor(input.host, input.company), input.runId, input.locale],
  );
  const run = await getRun(input.runId);
  await recordProductEvent({ eventName: "demo_signup_requested", source: "server", runId: input.runId, eventKey: input.runId, attribution: run?.attribution });
  const copy = COPY[input.locale];
  const origin = appOrigin();
  const message = rows[0]?.existing
    ? { subject: copy.existingSubject, text: copy.existing(`${origin}/workspace/sign-in`) }
    : { subject: copy.subject, text: copy.body(`${origin}/workspace/signup#${token}`) };
  await send(input.email.trim(), message);
}

export type DirectSignupOutcome = "link" | "account_exists" | "domain_taken";

/**
 * Direct sign-up with a work email (launch L-05). The caller has already
 * checked the address (`checkSignupEmail`) and the rate limits. Stores a link
 * unless the address has an account or, under the domain rule, the company
 * already has a workspace; every outcome sends exactly one email to the
 * address, so the caller's response is identical whatever the outcome.
 */
export async function requestDirectSignup(input: {
  email: string;
  company?: string;
  /** Registrable domain of the address. */
  domain: string;
  /** False only for addresses on the ops exception list. */
  domainRule: boolean;
  locale: "en" | "es";
  attribution?: Attribution;
}): Promise<DirectSignupOutcome> {
  const token = randomBytes(32).toString("base64url");
  const email = input.email.trim().toLowerCase();
  const { rows } = await getPostgresPool().query<{ outcome: DirectSignupOutcome }>(
    "SELECT evals.request_self_serve_signup($1, $2, $3, NULL, $4, 'direct', $5, $6, $7::jsonb) AS outcome",
    [sha256(token), email, input.company?.trim() ? workspaceNameFor(input.domain, input.company) : input.domain.charAt(0).toUpperCase() + input.domain.slice(1), input.locale, input.domain, input.domainRule, JSON.stringify(sanitizeAttribution(input.attribution))],
  );
  const outcome = rows[0]?.outcome ?? "link";
  const copy = COPY[input.locale];
  const origin = appOrigin();
  const message =
    outcome === "account_exists" ? { subject: copy.existingSubject, text: copy.existing(`${origin}/workspace/sign-in`) }
    : outcome === "domain_taken" ? { subject: copy.takenSubject, text: copy.taken(input.domain) }
    : { subject: copy.directSubject, text: copy.direct(`${origin}/workspace/signup#${token}`) };
  await send(email, message);
  return outcome;
}
