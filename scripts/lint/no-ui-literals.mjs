/**
 * ESLint rule `caudals/no-ui-literals` (launch L-23, spec P-45).
 *
 * The evaluation app and the public demo are bilingual. Every sentence a
 * person can see must come from a message catalogue (`t`, `tv`, `tr`,
 * `trServer`, or `useTranslations` for the demo), so a Spanish interface never
 * shows English. This rule reports text written directly in a component:
 *
 * - JSX text (`<button>Open</button>`),
 * - strings and template literals rendered as JSX children
 *   (`{busy ? "Saving…" : "Save"}`),
 * - visible attributes and props (`aria-label`, `title`, `placeholder`, `alt`,
 *   `label`, `*Label`, `description`, …),
 * - visible fields of object literals (`{ label: "All" }`), the usual source
 *   of tab, column and option labels,
 * - messages handed to state setters and toasts (`setError("Could not save")`).
 *
 * Text that is the same in every language is allowed: brand and product
 * names, units, file formats and technical identifiers ({@link ALLOWED_TERMS}),
 * numbers and punctuation, URLs, e-mail addresses, code identifiers, and
 * anything inside `<code>`, `<kbd>`, `<pre>` or `<samp>`. A real exception
 * takes an inline `// eslint-disable-next-line caudals/no-ui-literals -- why`.
 */

/**
 * Words and phrases that read the same in English and Spanish. Keep it to
 * names, units and technical identifiers; an ordinary word belongs in the
 * catalogue. Matched case-sensitively as whole words.
 */
export const ALLOWED_TERMS = [
  // Brand, product and company names.
  "Caudals",
  "Caudals Ops",
  "The Data Gap",
  "OpenAI",
  "Anthropic",
  "Claude",
  "Gemini",
  "Google",
  "Microsoft",
  "Microsoft Teams",
  "Teams",
  "Slack",
  "GitHub",
  "GitHub Actions",
  "GitLab",
  "Stripe",
  "Resend",
  "Sentry",
  "Cal.com",
  "OpenRouter",
  "NVIDIA",
  "DGX",
  "DGX Spark",
  "Spark",
  "DeepSeek",
  "Mistral",
  "Llama",
  "Qwen",
  "Ollama",
  "vLLM",
  "Azure",
  "AWS",
  "Bedrock",
  "Vertex",
  "Hetzner",
  "Cloudflare",
  "Docker",
  "Python",
  "Node",
  "Node.js",
  "Playwright",
  "Chromium",
  "Zendesk",
  "Intercom",
  "Warmbly",
  "Postgres",
  "PostgreSQL",
  "MinIO",
  "VIES",
  "Verifactu",
  "BOE",
  "LinkedIn",
  "Partner",
  // Model families, as typed in model filters ("gpt, claude, llama…").
  "gpt",
  "claude",
  "llama",
  "gemini",
  "mistral",
  "qwen",
  "deepseek",
  // Units, currencies and number words.
  "ms",
  "s",
  "min",
  "h",
  "d",
  "px",
  "KB",
  "MB",
  "GB",
  "pts",
  "pt",
  "EUR",
  "USD",
  "IVA",
  "VAT",
  "NIF",
  "CIF",
  "p50",
  "p90",
  "p95",
  "p99",
  "k",
  "M",
  // File formats, protocols and technical identifiers.
  "API",
  "APIs",
  "AI",
  "IA",
  "LLM",
  "CSV",
  "JSON",
  "JSONL",
  "YAML",
  "XML",
  "HTML",
  "PDF",
  "DOCX",
  "Word",
  "Markdown",
  "CEF",
  "SDK",
  "CLI",
  "CI",
  "URL",
  "URLs",
  "URI",
  "HTTP",
  "HTTPS",
  "SSE",
  "SSO",
  "SAML",
  "OAuth",
  "TOTP",
  "MFA",
  "2FA",
  "DPA",
  "RGPD",
  "GDPR",
  "SLA",
  "CRM",
  "KPI",
  "ID",
  "IDs",
  "UUID",
  "SHA-256",
  "HMAC",
  "UTC",
  "CET",
  "ISO",
  "DNS",
  "IP",
  "TLS",
  "SSH",
  "RLS",
  "SQL",
  "curl",
  "cURL",
  "iframe",
  "POST",
  "GET",
  "PUT",
  "PATCH",
  "DELETE",
  "Bearer",
  "Authorization",
  "Content-Type",
  "Idempotency-Key",
  "Retry-After",
  "Webhook",
  "Webhooks",
  "webhook",
  "Token",
  "token",
  "Email",
  "email",
  "OK",
  "N/A",
  "vs",
  "Wilson",
  "Hash",
  "Stage",
  "Pro",
  "Flash",
  "Luna",
  "Opus",
  "Sonnet",
  "Haiku",
  "GPT",
  "en",
  "es",
  "es-ES",
  "en-US",
  "EN",
  "ES",
  "English",
  "Español",
];

/** Elements whose text is code or keyboard input, not prose. */
const VERBATIM_ELEMENTS = new Set(["code", "kbd", "pre", "samp", "var"]);

/** JSX attributes and props that people read or hear. */
const VISIBLE_ATTRIBUTE =
  /^(alt|title|placeholder|label|caption|description|hint|heading|subtitle|summary|tooltip|message|body|detail|meta|note|legend|empty|confirm|fallback|headers|aria-(label|description|placeholder|roledescription|valuetext)|[a-z]+(Label|Title|Text|Message|Description|Hint|Placeholder|Heading|Caption|Summary|Tooltip|Note|Body))$/;

/** Object fields that end up on screen (tabs, columns, options, steps). */
const VISIBLE_PROPERTY =
  /^(label|title|placeholder|description|hint|heading|subtitle|summary|tooltip|caption|ariaLabel|emptyLabel|[a-z]+(Label|Title|Placeholder|Hint|Heading|Caption|Tooltip))$/;

/** Calls whose first argument is shown to the person. */
const VISIBLE_CALL = /^(set[A-Za-z]*(Error|Message|Notice|Feedback|Toast|Warning|Success|Problem|Alert)|toast|alert|confirm|prompt|announce)$/;

/**
 * A single lower-case token passed to a setter or stored in a field is an
 * error code or a state ("consent", "all"), not a sentence.
 */
const CODE = /^[a-z][a-z0-9]*(?:[_.:-][a-z0-9]+)*$/;

const LETTERS = /\p{L}{2,}/u;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function termsPattern(terms) {
  // Longest first, so "DGX Spark" goes before "DGX".
  const sorted = [...new Set(terms)].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${sorted.join("|")})(?![\\p{L}\\p{N}_])`, "gu");
}

const TECHNICAL_TOKENS = [
  /\bhttps?:\/\/\S*/gu, // URLs
  /\b[\w.+-]+@[\w-]+(\.[\w-]+)+\b/gu, // e-mail addresses
  /(?:^|\s)(?:\.{0,2}|~)\/[\w.\-[\]{}:/]*/gu, // paths such as /workspace/settings or ~/.config
  /\b[\w-]+(?:\/[\w.-]+){2,}/gu, // repository paths such as lib/evals/messages
  /\b[\w-]+\.(?:com|es|io|dev|json|csv|pdf|docx|md|ts|tsx|yml|yaml|txt|sh)\b/gu, // host and file names
  /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/gu, // snake_case identifiers
  /\b[A-Z0-9]+(?:_[A-Z0-9]+)+\b/gu, // CONSTANT_CASE identifiers
  /\b[a-z]+(?:[A-Z][a-z0-9]*)+\b/gu, // camelCase identifiers
  /\b[a-z0-9]+(?:-[a-z0-9]+){1,}\b/gu, // kebab-case identifiers
  /(?<![\p{L}\p{N}_])\p{Lu}{2,}[\p{Lu}\p{N}]*(?![\p{L}\p{N}_])/gu, // acronyms and codes (RPM, ECB, TEST)
];

/** Whether a piece of text still has words in it after removing what is language-neutral. */
export function hasProse(text, pattern) {
  let rest = text;
  for (const token of TECHNICAL_TOKENS) rest = rest.replace(token, " ");
  rest = rest.replace(pattern, " ");
  return LETTERS.test(rest);
}

function staticText(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return [{ node, text: node.value }];
  if (node.type === "TemplateLiteral") {
    // The parts between `${…}` are what a person reads.
    return [{ node, text: node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(" ") }];
  }
  if (node.type === "ConditionalExpression") return [...(staticText(node.consequent) ?? []), ...(staticText(node.alternate) ?? [])];
  if (node.type === "LogicalExpression") return [...(staticText(node.left) ?? []), ...(staticText(node.right) ?? [])];
  if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") return staticText(node.expression);
  // Column headers and option lists: ["Batch", "Tasks", …].
  if (node.type === "ArrayExpression") return node.elements.flatMap((element) => (element && (element.type === "Literal" || element.type === "TemplateLiteral") ? staticText(element) : []));
  return null;
}

function insideVerbatim(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "JSXElement") {
      const name = current.openingElement.name;
      if (name.type === "JSXIdentifier" && VERBATIM_ELEMENTS.has(name.name)) return true;
    }
  }
  return false;
}

function propertyName(node) {
  if (node.computed) return null;
  if (node.key.type === "Identifier") return node.key.name;
  if (node.key.type === "Literal" && typeof node.key.value === "string") return node.key.value;
  return null;
}

function calleeName(node) {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") return node.property.name;
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Text a person sees must come from the EN/ES message catalogues, not a string literal.",
    },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
    messages: {
      literal:
        "User-visible text “{{text}}” is not translated. Use a catalogue key (t/tv in lib/evals/messages, tr for fixed labels, useTranslations for the demo), or add a brand, unit or identifier to ALLOWED_TERMS in scripts/lint/no-ui-literals.mjs.",
    },
  },
  create(context) {
    const pattern = termsPattern([...ALLOWED_TERMS, ...(context.options[0]?.allow ?? [])]);

    function check(parts, { codes = false } = {}) {
      for (const { node, text } of parts ?? []) {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (!normalized || !hasProse(normalized, pattern)) continue;
        if (codes && CODE.test(normalized)) continue;
        if (insideVerbatim(node)) continue;
        context.report({
          node,
          messageId: "literal",
          data: { text: normalized.length > 60 ? `${normalized.slice(0, 57)}…` : normalized },
        });
      }
    }

    return {
      JSXText(node) {
        check([{ node, text: node.value }]);
      },
      JSXExpressionContainer(node) {
        if (node.parent.type === "JSXElement" || node.parent.type === "JSXFragment") check(staticText(node.expression));
      },
      JSXAttribute(node) {
        const name = node.name.type === "JSXNamespacedName" ? `${node.name.namespace.name}:${node.name.name.name}` : node.name.name;
        if (!VISIBLE_ATTRIBUTE.test(name) || !node.value) return;
        if (node.value.type === "Literal") check(staticText(node.value));
        else if (node.value.type === "JSXExpressionContainer") check(staticText(node.value.expression));
      },
      Property(node) {
        if (node.parent.type !== "ObjectExpression") return;
        const name = propertyName(node);
        if (name && VISIBLE_PROPERTY.test(name)) check(staticText(node.value), { codes: true });
      },
      CallExpression(node) {
        const name = calleeName(node.callee);
        if (name && VISIBLE_CALL.test(name)) check(staticText(node.arguments[0]), { codes: true });
      },
    };
  },
};

const plugin = {
  meta: { name: "caudals" },
  rules: { "no-ui-literals": rule },
};

/**
 * Where the rule applies: the evaluation app, the public demo, the evaluation
 * routes, the email templates (their copy is lib/email/copy.ts) and the public
 * site's components and pages. Not the blog and newsletter, whose text is
 * content in the post's own language. Used by eslint.config.mjs and by
 * `npm run i18n:check-parity` (scripts/lint/ui-literals.config.mjs over
 * {@link UI_LITERAL_DIRS}).
 */
export const UI_LITERAL_DIRS = [
  "components/evals",
  "components/demo",
  "app/(evaluation)",
  "lib/email/templates.tsx",
  "lib/email/layout.tsx",
  "components/landing",
  "components/public",
  "components/sectors",
  "components/contact",
  "components/call",
  "components/methodology",
  "components/sample-report",
  "components/i18n",
  "components/legal",
  "app/[locale]",
];

export const uiLiteralsConfig = {
  files: [
    "components/evals/**/*.{ts,tsx}",
    "components/demo/**/*.{ts,tsx}",
    "app/(evaluation)/**/*.{ts,tsx}",
    "lib/email/templates.tsx",
    "lib/email/layout.tsx",
    "components/{landing,public,sectors,contact,call,methodology,sample-report,i18n,legal}/**/*.{ts,tsx}",
    "app/[[]locale]/**/*.{ts,tsx}",
  ],
  ignores: ["**/*.test.{ts,tsx}"],
  plugins: { caudals: plugin },
  rules: { "caudals/no-ui-literals": "error" },
};

export default plugin;
