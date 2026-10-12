/**
 * Sends one branded sample email to Caudals' own collaboration inbox (launch
 * L-07 production check). The recipient is read from COLLABORATION_NOTIFICATION_EMAIL
 * and is never printed; no other recipient is possible. Links point at
 * placeholders on app.caudals.com, so the sample cannot sign anyone in.
 *
 *   sudo bash -c 'set -a; . /root/.caudals/app/credentials.env; set +a; \
 *     node --conditions=react-server --import tsx scripts/evals/send-sample-email.ts welcome es'
 *
 * Prints the template, language, subject and Resend message id only.
 */
import { getResendClient } from "@/lib/resend/client";
import { renderEmail, type TemplateName } from "@/lib/email/templates";

const APP = "https://app.caudals.com";
const unsubscribe = { pageUrl: `${APP}/workspace/unsubscribe`, oneClickUrl: `${APP}/api/evals/v1/email/unsubscribe` };
const settingsUrl = `${APP}/workspace/settings?tab=notifications`;
const SAMPLES: Partial<{ [K in TemplateName]: Parameters<typeof renderEmail<K>>[2] }> = {
  welcome: { name: "Caudals", workspace: "Caudals (sample)", workspaceUrl: `${APP}/workspace/evaluations`, unsubscribe },
  d7_report: { workspaceUrl: `${APP}/workspace/evaluations`, callUrl: "https://cal.com/caudals/call", unsubscribe },
  signup_link: { link: `${APP}/workspace/signup`, source: "demo", demo: { host: "caudals.com", correct: 7, scored: 8 } },
  report_published: { url: `${APP}/workspace/reports`, settingsUrl },
  password_reset: { url: `${APP}/workspace/reset-password`, minutes: 30 },
};

async function main() {
  const [name, locale] = process.argv.slice(2) as [TemplateName, "en" | "es"];
  const props = SAMPLES[name];
  if (!props || (locale !== "en" && locale !== "es")) throw new Error(`usage: send-sample-email.ts <${Object.keys(SAMPLES).join("|")}> <en|es>`);
  const to = process.env.COLLABORATION_NOTIFICATION_EMAIL?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!to || !from) throw new Error("COLLABORATION_NOTIFICATION_EMAIL and RESEND_FROM_EMAIL are required");
  const email = renderEmail(name, locale, props as never);
  const { data, error } = await getResendClient().emails.send({
    from: from.includes("<") ? from : `Caudals <${from}>`, to, subject: `[Sample] ${email.subject}`,
    text: email.text, html: email.html, ...(email.headers ? { headers: email.headers } : {}),
    tags: [{ name: "source", value: "l07-sample" }],
  });
  if (error) throw new Error(`email_provider_rejected: ${error.name}`);
  console.log(JSON.stringify({ template: name, locale, subject: email.subject, id: data?.id ?? null }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "failed");
  process.exitCode = 1;
});
