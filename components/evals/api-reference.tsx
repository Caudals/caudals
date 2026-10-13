"use client";

/**
 * API reference in Settings → Developers (launch L-20, P-29). Endpoints,
 * scopes, fields, events and limits are read from
 * lib/evals/monitoring/customer-api.ts, the same constants the routes use, so
 * the reference cannot describe a field or a scope the API does not have.
 */
import { useSyncExternalStore } from "react";
import { DataTable, SectionHeading } from "./primitives";
import { CodeBlock, CopyField } from "./overlays";
import { apiCurl, ciGateScript, estimateCurl, NODE_VERIFIER, PYTHON_VERIFIER, webhookExample } from "@/lib/evals/api-reference";
import {
  CI_STATUS_FIELDS,
  CUSTOMER_API_FIELDS,
  CUSTOMER_API_LIMITS,
  CUSTOMER_API_RESOURCES,
  CUSTOMER_TOKEN_SCOPES,
  WEBHOOK_EVENT_KINDS,
  WEBHOOK_HEADERS,
  type CustomerResource,
  type CustomerScope,
  type WebhookEventKind,
} from "@/lib/evals/monitoring/customer-api";
import { t, tv, type MessageKey } from "@/lib/evals/messages/en";

const DEFAULT_ORIGIN = "https://app.caudals.com";
const noSubscription = () => () => undefined;

const SCOPE_HELP: Record<CustomerScope, MessageKey> = {
  "runs:read": "apiRefScopeRuns",
  "reports:read": "apiRefScopeReports",
  "schedules:read": "apiRefScopeSchedules",
};
const LIST_HELP: Record<CustomerResource, MessageKey> = {
  runs: "apiRefEndpointRuns",
  reports: "apiRefEndpointReports",
  schedules: "apiRefEndpointSchedules",
};
const EVENT_HELP: Record<WebhookEventKind, MessageKey> = {
  run_completed: "apiRefEventRunCompleted",
  regression: "apiRefEventRegression",
  inconclusive: "apiRefEventInconclusive",
  run_partial: "apiRefEventRunPartial",
  run_unknown: "apiRefEventRunUnknown",
};

function Codes({ values }: { values: readonly string[] }) {
  return (
    <span className="p-api-codes">
      {values.map((value) => (
        <code key={value} className="p-code">
          {value}
        </code>
      ))}
    </span>
  );
}

function Endpoint({ method, path, scope, children, fields }: { method: "GET" | "POST"; path: string; scope: CustomerScope; children: React.ReactNode; fields?: readonly string[] }) {
  return (
    <article className="p-api-endpoint">
      <h4>
        <code className="p-api-method">{method}</code> <code className="p-api-path">{path}</code>
      </h4>
      <p>{children}</p>
      <dl className="p-api-facts">
        <div>
          <dt>{t("apiRefScopeLabel")}</dt>
          <dd>
            <Codes values={[scope]} />
          </dd>
        </div>
        {fields && (
          <div>
            <dt>{t("apiRefFields")}</dt>
            <dd>
              <Codes values={fields} />
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

export function ApiReference({ orgId, estimates = false }: { orgId: string; estimates?: boolean }) {
  // The page's own origin in the browser; the server renders the production one.
  const origin = useSyncExternalStore(noSubscription, () => window.location.origin, () => DEFAULT_ORIGIN);
  const limits = CUSTOMER_API_LIMITS;
  const resources = Object.keys(CUSTOMER_API_RESOURCES) as CustomerResource[];

  return (
    <section className="p-section p-api-ref" aria-labelledby="api-reference">
      <SectionHeading id="api-reference" title={t("apiRefTitle")}>
        {t("apiRefIntro")}
      </SectionHeading>

      <section aria-labelledby="api-auth">
        <h3 id="api-auth">{t("apiRefAuthTitle")}</h3>
        <p>{t("apiRefAuthBody")}</p>
        <div className="p-api-ids">
          <CopyField label={t("apiRefWorkspaceId")} value={orgId} />
          <CopyField label={t("apiRefBaseUrl")} value={`${origin}/api/evals/v1`} />
        </div>
      </section>

      <section aria-labelledby="api-scopes">
        <h3 id="api-scopes">{t("apiRefScopesTitle")}</h3>
        <DataTable caption={t("apiRefScopesTitle")} headers={[t("scope"), t("apiRefAllows")]}>
          {CUSTOMER_TOKEN_SCOPES.map((scope) => (
            <tr key={scope}>
              <td>
                <code className="p-code">{scope}</code>
              </td>
              <td>{t(SCOPE_HELP[scope])}</td>
            </tr>
          ))}
        </DataTable>
      </section>

      <section aria-labelledby="api-endpoints">
        <h3 id="api-endpoints">{t("apiRefEndpointsTitle")}</h3>
        {resources.map((resource) => (
          <Endpoint key={resource} method="GET" path={`/api/evals/v1/integrations/${resource}?orgId=…`} scope={CUSTOMER_API_RESOURCES[resource]} fields={CUSTOMER_API_FIELDS[resource]}>
            {tv(LIST_HELP[resource], { n: limits.listItems })}
          </Endpoint>
        ))}
        <CodeBlock label="curl" code={apiCurl(origin, orgId, "runs")} />
        <Endpoint method="GET" path="/api/evals/v1/integrations/ci/{scheduleId}?orgId=…" scope="runs:read" fields={CI_STATUS_FIELDS}>
          {t("apiRefEndpointCi")}
        </Endpoint>
        <CodeBlock label={t("apiRefGateExample")} code={ciGateScript(origin, orgId)} />
        {estimates && (
          <>
            <Endpoint method="POST" path="/api/evals/v1/billing/estimates" scope="runs:read">
              {t("apiRefEndpointEstimate")}
            </Endpoint>
            <CodeBlock label="curl" code={estimateCurl(origin, orgId)} />
          </>
        )}
      </section>

      <section aria-labelledby="api-errors">
        <h3 id="api-errors">{t("apiRefErrorsTitle")}</h3>
        <p>{t("apiRefErrorsBody")}</p>
        <ul className="p-bullets">
          {(["400", "401", "403", "404", "429"] as const).map((status) => (
            <li key={status}>
              <code className="p-code">{status}</code> {t(`apiRefError${status}` as MessageKey)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="api-limits">
        <h3 id="api-limits">{t("apiRefLimitsTitle")}</h3>
        <ul className="p-bullets">
          <li>{tv("apiRefLimitRate", { n: limits.requestsPerWindow })}</li>
          <li>{tv("apiRefLimitList", { n: limits.listItems })}</li>
          <li>{t("apiRefLimitToken")}</li>
        </ul>
      </section>

      <section aria-labelledby="api-webhooks">
        <h3 id="api-webhooks">{t("apiRefWebhooksTitle")}</h3>
        <p>{t("apiRefWebhooksBody")}</p>
        <DataTable caption={t("apiRefWebhooksTitle")} headers={[t("apiRefEventCol"), t("apiRefWhenCol")]}>
          {WEBHOOK_EVENT_KINDS.map((kind) => (
            <tr key={kind}>
              <td>
                <code className="p-code">{kind}</code>
              </td>
              <td>{t(EVENT_HELP[kind])}</td>
            </tr>
          ))}
        </DataTable>
        <CodeBlock label={t("apiRefPayloadTitle")} code={webhookExample()} />
        <h4>{t("apiRefSignatureTitle")}</h4>
        <p>
          {t("apiRefSignatureBody")} <Codes values={Object.values(WEBHOOK_HEADERS)} />
        </p>
        <CodeBlock label="Node.js" code={NODE_VERIFIER} />
        <CodeBlock label="Python" code={PYTHON_VERIFIER} />
        <h4>{t("apiRefDeliveryTitle")}</h4>
        <p>{tv("apiRefDeliveryBody", { timeout: limits.webhookTimeoutSeconds, attempts: limits.webhookAttempts })}</p>
      </section>
    </section>
  );
}
