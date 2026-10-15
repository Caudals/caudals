import { getSecretEnvValue } from "@/lib/env/secrets";
import {
  evaluationOwnerRoleLabels,
  evaluationRequestOfferLabels,
  evaluationSectorLabels,
  evaluationSystemStageLabels,
  evaluationSystemTypeLabels,
  type EvaluationRequestFormValues,
} from "@/lib/validators/evaluation-request";
import { logWarn } from "@/lib/security/structured-logger";

/**
 * Best-effort notifications into the founders' Slack (infra/slack/README.md).
 * Off unless SLACK_BOT_TOKEN (or SLACK_BOT_TOKEN_FILE) and the channel's ID
 * variable are set. It never throws and gives up after a few seconds, so a
 * slow or failing Slack cannot hold up or fail a public request.
 */
const channelEnv = {
  customers: "SLACK_CUSTOMERS_CHANNEL_ID",
} as const;

export type SlackNotificationChannel = keyof typeof channelEnv;

type SlackMessage = { text: string; blocks?: unknown[] };

const TIMEOUT_MS = 3_000;

export async function notifySlack(
  channel: SlackNotificationChannel,
  message: SlackMessage,
  {
    env = process.env,
    fetchImpl = fetch,
  }: { env?: Record<string, string | undefined>; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const channelId = env[channelEnv[channel]]?.trim();
  let token: string | undefined;
  try {
    token = getSecretEnvValue("SLACK_BOT_TOKEN", { env });
  } catch (error) {
    logWarn("slack.token_unreadable", { error });
    return false;
  }
  if (!token || !channelId) return false;

  try {
    const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: channelId,
        text: message.text,
        blocks: message.blocks,
        unfurl_links: false,
        unfurl_media: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json()) as { ok?: boolean; error?: string };
    if (!body.ok) {
      logWarn("slack.post_failed", { channel, error: body.error ?? response.status });
      return false;
    }
    return true;
  } catch (error) {
    logWarn("slack.post_failed", { channel, error });
    return false;
  }
}

/**
 * #customers message for a new /contact evaluation request. It carries the
 * company and the request's shape, not the requester's name, email or notes:
 * those stay in the notification email and Ops.
 */
export function buildEvaluationRequestSlackMessage(
  data: EvaluationRequestFormValues,
  { evaluationRequestId, opsUrl }: { evaluationRequestId?: string; opsUrl: string },
): SlackMessage {
  const facts = [
    data.systemType ? evaluationSystemTypeLabels[data.systemType] : null,
    evaluationSectorLabels[data.sector],
    data.systemStage ? evaluationSystemStageLabels[data.systemStage] : null,
    data.companySize ? `${data.companySize} employees` : null,
  ].filter(Boolean);
  const details = [
    data.ownerRole ? `Owner: ${evaluationOwnerRoleLabels[data.ownerRole]}` : null,
    data.requestedOffer
      ? `Wants: ${evaluationRequestOfferLabels[data.requestedOffer]}`
      : null,
    data.organizationWebsite ? slackLink(data.organizationWebsite, "Website") : null,
  ].filter(Boolean);
  const text = `New evaluation request: ${data.organization}`;

  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${escapeMrkdwn(text)}*\n${facts.join(" · ")}\n${details.join(" · ")}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${opsUrl}|Open in Ops>${
              evaluationRequestId ? ` · request \`${evaluationRequestId}\`` : ""
            } · contact details are in the notification email`,
          },
        ],
      },
    ],
  };
}

/** A requester-supplied URL as a Slack link, or nothing if it is not plain http(s). */
function slackLink(value: string, label: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `<${url.href.replace(/\|/g, "%7C").replace(/>/g, "%3E")}|${label}>`;
  } catch {
    return null;
  }
}

function escapeMrkdwn(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
