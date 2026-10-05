import "server-only";
import { randomBytes } from "node:crypto";
import { getPostgresPool } from "@/lib/db/client";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { getResendClient } from "@/lib/resend/client";
import { sha256 } from "./client";
import { registrable } from "./web";

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
  },
  es: {
    subject: "Termina de crear tu cuenta de Caudals",
    body: (link: string) => `Abre este enlace para elegir una contraseña y ver tu demo en tu propio espacio de trabajo:\n\n${link}\n\nEl enlace sirve una sola vez y caduca en dos días. Si no lo has pedido tú, ignora este correo.`,
    existingSubject: "Ya tienes una cuenta de Caudals",
    existing: (link: string) => `Alguien (probablemente tú) ha pedido crear una cuenta de Caudals con esta dirección, pero ya existe. Entra aquí:\n\n${link}\n\nSi no has sido tú, ignora este correo.`,
  },
};

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
  const from = getSecretEnvValue("RESEND_FROM_EMAIL");
  if (!from) throw new Error("email_unconfigured");
  const copy = COPY[input.locale];
  const origin = appOrigin();
  const message = rows[0]?.existing
    ? { subject: copy.existingSubject, text: copy.existing(`${origin}/workspace/sign-in`) }
    : { subject: copy.subject, text: copy.body(`${origin}/workspace/signup#${token}`) };
  await getResendClient().emails.send({ from, to: input.email.trim(), subject: message.subject, text: message.text });
}
