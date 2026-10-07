/**
 * Platform UI kit.
 *
 * Every authenticated Caudals surface composes from these. The visual contract
 * lives in `packages/brand/platform.css` — these components only choose the
 * right class and the right semantics. If a screen needs a look that is not
 * here, add it here and to DESIGN.md rather than styling inline.
 *
 * Pure components live here. Interactive overlays (menus, dialogs, side
 * panels, toasts) live in `overlays.tsx`; data graphics in `charts.tsx`.
 */
import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check as CheckIcon,
  ChevronRight,
  Inbox,
  Info,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { evaluationSignInPath, evaluationRecoveryPath } from "./auth-path";
import { t } from "@/lib/evals/messages/en";
import { tr } from "@/lib/evals/messages/phrases";

/* ---------------------------------------------------------------- buttons -- */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";
type Shape = "default" | "pill" | "icon";

type ActionProps = {
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  block?: boolean;
};

function actionAttrs({ variant = "primary", size = "md", shape = "default", block }: ActionProps) {
  return {
    className: "p-btn",
    "data-variant": variant,
    ...(size === "md" ? {} : { "data-size": size }),
    ...(shape === "default" ? {} : { "data-shape": shape }),
    ...(block ? { "data-block": "true" } : {}),
  };
}

export function Action({
  variant,
  size,
  shape,
  block,
  ...props
}: ComponentProps<"button"> & ActionProps) {
  return <button type="button" {...actionAttrs({ variant, size, shape, block })} {...props} />;
}

/** Same visual contract as `Action`, for navigation rather than a command. */
export function ActionLink({
  variant,
  size,
  shape,
  block,
  ...props
}: ComponentProps<typeof Link> & ActionProps) {
  return <Link {...actionAttrs({ variant, size, shape, block })} {...props} />;
}

/** Same visual contract as `Action`, for a plain anchor (downloads, mailto). */
export function ActionAnchor({
  variant,
  size,
  shape,
  block,
  ...props
}: ComponentProps<"a"> & ActionProps) {
  return <a {...actionAttrs({ variant, size, shape, block })} {...props} />;
}

/** Filter/segment chip: the `+ Method` affordance across the toolbars. */
export function Chip({ active, ...props }: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className="p-chip"
      aria-pressed={active ? "true" : "false"}
      {...props}
    />
  );
}

/* ------------------------------------------------------------ page layout -- */

export function PageHeading({
  title,
  actions,
  meta,
  children,
}: {
  title: ReactNode;
  actions?: ReactNode;
  /** A row of badges or facts under the title (status, dates, counts). */
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="p-head">
      <div className="p-head-text">
        <h1>{title}</h1>
        {meta && <div className="p-head-meta">{meta}</div>}
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="p-head-actions">{actions}</div>}
    </header>
  );
}

export function SectionHeading({
  title,
  actions,
  children,
  id,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div className="p-section-head">
      <div className="p-head-text">
        <h2 id={id}>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="p-head-actions">{actions}</div>}
    </div>
  );
}

/** A titled region of a page. Spacing between sections comes from here. */
export function Section({
  title,
  description,
  actions,
  children,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="p-section">
      {title && (
        <SectionHeading title={title} actions={actions}>
          {description}
        </SectionHeading>
      )}
      {children}
    </section>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="p-toolbar">{children}</div>;
}

export function Card({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="p-card">
      {title && <SectionHeading title={title} actions={actions} />}
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ tabs -- */

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
  variant = "underline",
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode; count?: number }>;
  onChange: (value: T) => void;
  label: string;
  variant?: "underline" | "pill";
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="p-tabs"
      {...(variant === "pill" ? { "data-variant": "pill" } : {})}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          className="p-tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
          {option.count != null && <span className="p-tab-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Tabs that are separate routes. Same look; real links, so they deep-link. */
export function TabLinks({
  current,
  options,
  label,
}: {
  current: string;
  options: ReadonlyArray<{ href: string; label: string; id: string }>;
  label: string;
}) {
  return (
    <nav aria-label={label} className="p-tabs">
      {options.map((option) => (
        <Link
          key={option.id}
          href={option.href}
          className="p-tab"
          aria-current={option.id === current ? "page" : undefined}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

/* --------------------------------------------------------------- verdicts -- */

export type Tone = "neutral" | "pass" | "warn" | "fail" | "info" | "strong";

/**
 * Domain status → tone + human label.
 *
 * Raw `snake_case` enum values must never reach a customer. Anything unmapped
 * degrades to a humanised neutral pill rather than disappearing, so a new
 * backend state is legible on the day it ships.
 */
const STATUS: Record<string, { tone: Tone; label: string }> = {
  // preparation
  draft: { tone: "neutral", label: "Draft" },
  ready: { tone: "pass", label: "Ready" },
  needs_review: { tone: "warn", label: "Needs review" },
  needs_input: { tone: "warn", label: "Needs input" },
  validating: { tone: "info", label: "Validating" },
  checking_connection: { tone: "info", label: "Checking connection" },
  ingesting: { tone: "info", label: "Reading sources" },
  profiling: { tone: "info", label: "Understanding system" },
  generating: { tone: "info", label: "Preparing tests" },
  awaiting_answers: { tone: "warn", label: "Waiting for answers" },
  // runs
  queued: { tone: "info", label: "Queued" },
  running: { tone: "info", label: "Running" },
  paused: { tone: "warn", label: "Paused" },
  pause_requested: { tone: "warn", label: "Pausing" },
  cancel_requested: { tone: "warn", label: "Cancelling" },
  completed: { tone: "pass", label: "Completed" },
  partial: { tone: "warn", label: "Partial" },
  failed: { tone: "fail", label: "Failed" },
  canceled: { tone: "neutral", label: "Cancelled" },
  succeeded: { tone: "pass", label: "Answered" },
  pending: { tone: "neutral", label: "Pending" },
  // run phases
  preflight: { tone: "info", label: "Checking plan" },
  target_execution: { tone: "info", label: "Asking the system" },
  grading: { tone: "info", label: "Grading answers" },
  aggregation: { tone: "info", label: "Computing results" },
  reporting: { tone: "info", label: "Writing report" },
  done: { tone: "pass", label: "Done" },
  // connections + runners
  connected: { tone: "pass", label: "Connected" },
  paired: { tone: "pass", label: "Paired" },
  healthy: { tone: "pass", label: "Healthy" },
  degraded: { tone: "warn", label: "Degraded" },
  unhealthy: { tone: "fail", label: "Unhealthy" },
  circuit_open: { tone: "fail", label: "Paused (circuit open)" },
  unprobed: { tone: "neutral", label: "Not checked" },
  retired: { tone: "neutral", label: "Retired" },
  enabled: { tone: "pass", label: "Enabled" },
  disabled: { tone: "neutral", label: "Disabled" },
  revoked: { tone: "neutral", label: "Revoked" },
  token_expired: { tone: "warn", label: "Token expired" },
  unsupported: { tone: "fail", label: "Unsupported" },
  needs_operator: { tone: "warn", label: "Needs assistance" },
  target_error: { tone: "fail", label: "System error" },
  transport_error: { tone: "fail", label: "Network error" },
  timeout: { tone: "fail", label: "Timed out" },
  capture_incomplete: { tone: "warn", label: "Capture incomplete" },
  unknown_external_outcome: { tone: "neutral", label: "Unknown outcome" },
  pairing_required: { tone: "warn", label: "Pairing required" },
  runner_wait: { tone: "warn", label: "Awaiting runner" },
  // connection kinds
  website: { tone: "neutral", label: "Website chatbot" },
  openai_compatible: { tone: "neutral", label: "OpenAI-compatible API" },
  provider_native: { tone: "neutral", label: "Provider API" },
  https_json: { tone: "neutral", label: "HTTPS JSON API" },
  imported_responses: { tone: "neutral", label: "Uploaded answers" },
  private_runner: { tone: "neutral", label: "Private runner" },
  deployed_system: { tone: "neutral", label: "Deployed system" },
  controlled_model: { tone: "neutral", label: "Controlled model" },
  // reports
  published: { tone: "pass", label: "Published" },
  superseded: { tone: "neutral", label: "Superseded" },
  withdrawn: { tone: "neutral", label: "Withdrawn" },
  preliminary: { tone: "info", label: "Preliminary" },
  reviewed: { tone: "pass", label: "Reviewed" },
  complete: { tone: "pass", label: "Complete" },
  incomplete: { tone: "warn", label: "Incomplete" },
  unreviewed: { tone: "neutral", label: "Unreviewed" },
  // comparisons
  compatible: { tone: "pass", label: "Comparable" },
  incompatible: { tone: "warn", label: "Not comparable" },
  inconclusive: { tone: "neutral", label: "Inconclusive" },
  improved: { tone: "pass", label: "Improved" },
  regressed: { tone: "fail", label: "Regressed" },
  unchanged: { tone: "neutral", label: "Unchanged" },
  regression: { tone: "fail", label: "Regression" },
  // severities + outcomes
  critical: { tone: "fail", label: "Critical" },
  high: { tone: "fail", label: "High" },
  medium: { tone: "warn", label: "Medium" },
  low: { tone: "neutral", label: "Low" },
  pass: { tone: "pass", label: "Pass" },
  fail: { tone: "fail", label: "Fail" },
  unscorable: { tone: "neutral", label: "Not scored" },
  // review + experts
  assigned: { tone: "info", label: "Assigned" },
  in_progress: { tone: "info", label: "In progress" },
  conflict: { tone: "fail", label: "Save conflict" },
  guideline_changed: { tone: "warn", label: "Guideline changed" },
  submitted: { tone: "info", label: "Submitted" },
  in_review: { tone: "info", label: "In review" },
  changes_requested: { tone: "warn", label: "Changes requested" },
  approved: { tone: "pass", label: "Approved" },
  rejected: { tone: "fail", label: "Rejected" },
  disputed: { tone: "warn", label: "Disputed" },
  adjudicated: { tone: "strong", label: "Adjudicated" },
  not_required: { tone: "neutral", label: "Not required" },
  active: { tone: "pass", label: "Active" },
  quarantined: { tone: "fail", label: "Quarantined" },
  released: { tone: "pass", label: "Released" },
};

export function humanize(value: string) {
  const known = STATUS[value];
  if (known) return tr(known.label);
  const words = value.replaceAll("_", " ").trim();
  return words ? tr(words[0].toUpperCase() + words.slice(1)) : value;
}

export function toneFor(value: string): Tone {
  return STATUS[value]?.tone ?? "neutral";
}

const LIVE = new Set([
  "running",
  "queued",
  "validating",
  "generating",
  "checking_connection",
  "ingesting",
  "profiling",
  "preflight",
  "target_execution",
  "grading",
  "aggregation",
  "reporting",
]);

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  live = false,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  live?: boolean;
}) {
  return (
    <span className="p-badge" data-tone={tone}>
      {dot && <span className="p-dot" aria-hidden="true" {...(live ? { "data-live": "true" } : {})} />}
      {children}
    </span>
  );
}

/** A domain status rendered as a pill. Colour plus word, never colour alone. */
export function StatusBadge({
  value,
  fallback,
  label,
}: {
  value: string | null | undefined;
  fallback?: string;
  /** Override the catalogue label while keeping the status tone. */
  label?: string;
}) {
  if (!value) return <span className="p-cell-meta">{fallback ?? t("notAvailable")}</span>;
  return (
    <Badge tone={toneFor(value)} dot live={LIVE.has(value)}>
      {label ?? humanize(value)}
    </Badge>
  );
}

/* ---------------------------------------------------------------- status -- */

export function Status({
  children,
  error = false,
  tone,
  action,
}: {
  children: ReactNode;
  error?: boolean;
  tone?: "error" | "success" | "warn" | "info";
  /** One follow-up control, aligned to the end of the banner. */
  action?: ReactNode;
}) {
  const resolved = tone ?? (error ? "error" : undefined);
  const Icon =
    resolved === "error" ? AlertCircle : resolved === "success" ? CheckIcon : resolved === "warn" ? TriangleAlert : Info;
  return (
    <div
      role={resolved === "error" ? "alert" : "status"}
      className="p-status"
      {...(resolved ? { "data-tone": resolved } : {})}
    >
      <Icon aria-hidden="true" />
      <span className="p-status-text">{children}</span>
      {action && <span className="p-status-action">{action}</span>}
    </div>
  );
}

/** Indeterminate wait. Reads as a sentence, not a bare spinner. */
export function Loading({ children }: { children?: ReactNode }) {
  return (
    <p className="p-loading" role="status">
      <span className="p-spinner" aria-hidden="true" />
      <span>{children ?? t("loading")}</span>
    </p>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="p-progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Stage tracker for a multi-step workflow. Each stage is a projection of a
 * real backend state, never a timed animation.
 */
export function Steps({ steps, label, selected, onSelect }: {
  steps: ReadonlyArray<{ label: string; state: "done" | "current" | "upcoming" | "blocked" }>;
  label: string;
  selected?: number;
  onSelect?: (index: number) => void;
}) {
  return <ol className="p-steps" aria-label={label}>
    {steps.map((step, index) => {
      const content = <><span className="p-step-mark" aria-hidden="true">{step.state === "done" ? <CheckIcon /> : step.state === "blocked" ? <TriangleAlert /> : index + 1}</span><span className="p-step-label">{step.label}</span><span className="sr-only">{step.state === "done" ? " — done" : step.state === "current" ? " — in progress" : step.state === "blocked" ? " — needs attention" : ""}</span></>;
      return <li key={step.label} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
        {onSelect ? <button type="button" className="p-step-button" disabled={index !== 0 && step.state !== "current" && step.state !== "blocked" && !(index === 3 && step.state === "done")} aria-pressed={selected === index} onClick={() => onSelect(index)}>{content}</button> : content}
      </li>;
    })}
  </ol>;
}

/* ----------------------------------------------------------------- stats -- */

export function Stat({
  label,
  value,
  meta,
  hero = false,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  hero?: boolean;
}) {
  return (
    <div className="p-stat">
      <span className="p-stat-label">{label}</span>
      <span className="p-stat-value" {...(hero ? { "data-size": "hero" } : {})}>
        {value}
      </span>
      {meta && <span className="p-stat-meta">{meta}</span>}
    </div>
  );
}

/** One strip of related figures, divided by hairlines — not a grid of cards. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="p-stats">{children}</div>;
}

export function DefinitionList({ items }: { items: Array<{ term: string; value: ReactNode }> }) {
  return (
    <dl className="p-defs">
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------- settings -- */

/** Settings as rows: what it is on the left, the control on the right. */
export function SettingsRow({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div className="p-setting" id={id}>
      <div className="p-setting-text">
        <h3>{title}</h3>
        {description && <div className="p-setting-desc">{description}</div>}
      </div>
      {children && <div className="p-setting-control">{children}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- forms -- */

export function Field({
  label,
  id,
  hint,
  ...props
}: ComponentProps<"input"> & { label: string; id: string; hint?: ReactNode }) {
  return (
    <div className="p-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...props} />
      {hint && <span className="p-field-hint">{hint}</span>}
    </div>
  );
}

export function TextArea({
  label,
  id,
  hint,
  ...props
}: ComponentProps<"textarea"> & { label: string; id: string; hint?: ReactNode }) {
  return (
    <div className="p-field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} {...props} />
      {hint && <span className="p-field-hint">{hint}</span>}
    </div>
  );
}

export function SelectField({
  label,
  id,
  hint,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; id: string; hint?: ReactNode }) {
  return (
    <div className="p-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {children}
      </select>
      {hint && <span className="p-field-hint">{hint}</span>}
    </div>
  );
}

/** Checkbox with its label and an optional line of explanation. */
export function Check({
  label,
  description,
  ...props
}: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className="p-check">
      <input type="checkbox" {...props} />
      <span>
        <span className="p-check-label">{label}</span>
        {description && <span className="p-check-desc">{description}</span>}
      </span>
    </label>
  );
}

/** On/off switch for a setting that applies immediately. Label it with aria-label or aria-labelledby. */
export function Switch(props: Omit<ComponentProps<"input">, "type" | "role">) {
  return (
    <span className="p-toggle">
      <input type="checkbox" role="switch" {...props} />
      <span className="p-toggle-track" aria-hidden="true" />
    </span>
  );
}

/** Compact inline select for toolbars, where the label sits beside the control. */
export function InlineSelect({
  label,
  id,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; id: string }) {
  return (
    <span className="p-inline-select">
      <label className="p-toolbar-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} {...props}>
        {children}
      </select>
    </span>
  );
}

/** Search box with a leading icon and a clear button once it has a value. */
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}) {
  return (
    <div className="p-search" role="search">
      <Search aria-hidden="true" />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button type="button" className="p-search-clear" aria-label={t("clearSearch")} onClick={() => onChange("")}>
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Mutually exclusive filter chips with counts, in one row under the search. */
export function FilterChips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="p-filters" role="group" aria-label={label}>
      {options.map((option) => (
        <Chip key={option.value} active={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
          {option.count != null && <span className="p-chip-count">{option.count}</span>}
        </Chip>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- tables -- */

export function DataTable({
  caption,
  headers,
  children,
}: {
  caption: string;
  headers: Array<string | { label: string; align?: "end"; hidden?: boolean }>;
  children: ReactNode;
}) {
  return (
    <div className="p-table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table className="p-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => {
              const label = typeof header === "string" ? header : header.label;
              const end = typeof header !== "string" && header.align === "end";
              const hidden = typeof header !== "string" && header.hidden;
              return (
                <th scope="col" key={label} className={end ? "p-table-action" : undefined}>
                  {hidden ? <span className="sr-only">{label}</span> : label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Row header cell with an optional second line of context. With `href` the
 * title is a real link whose hit area stretches over the whole row, so the row
 * is clickable without losing keyboard and screen-reader semantics.
 */
export function RowTitle({ children, meta, href }: { children: ReactNode; meta?: ReactNode; href?: string }) {
  return (
    <th scope="row">
      <span className="p-table-primary">
        {href ? (
          <Link className="p-row-link" href={href}>
            {children}
          </Link>
        ) : (
          <span>{children}</span>
        )}
        {meta && <span className="p-cell-meta">{meta}</span>}
      </span>
    </th>
  );
}

/** Known-shape placeholder rows while a table loads. */
export function TableSkeleton({ rows = 4, columns = 3, label }: { rows?: number; columns?: number; label?: string }) {
  return (
    <div className="p-table-wrap" role="status" aria-label={label ?? t("loading")}>
      <table className="p-table" aria-hidden="true">
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }, (_, column) => (
                <td key={column}>
                  <span className="p-skeleton" style={{ width: column === 0 ? "60%" : "40%" }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ time -- */

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const ABSOLUTE = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const DAY = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

/** Money as a person reads it: grouped, at most two decimals, with its currency. */
export function formatMoney(value: string | number | null | undefined, currency?: string) {
  if (value == null || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const text = number.toLocaleString("en-GB", { minimumFractionDigits: number % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return currency ? `${text} ${currency}` : text;
}

export function formatDate(value: string | Date | null | undefined, withTime = false) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return (withTime ? ABSOLUTE : DAY).format(date);
}

export function relativeTime(value: string | Date | null | undefined, now = Date.now()) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return RELATIVE.format(Math.round(seconds / 3600), "hour");
  if (abs < 86_400 * 7) return RELATIVE.format(Math.round(seconds / 86_400), "day");
  return DAY.format(date);
}

/** A timestamp that reads relatively and exposes the exact time on hover. */
export function Time({ value, withTime = true }: { value: string | null | undefined; withTime?: boolean }) {
  if (!value) return <span className="p-cell-meta">—</span>;
  return (
    <time dateTime={value} title={formatDate(value, true)}>
      {withTime ? relativeTime(value) : formatDate(value)}
    </time>
  );
}

/* ----------------------------------------------------------- empty state -- */

export function EmptyState({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="p-empty">
      <span className="p-empty-mark" aria-hidden="true">
        {icon ?? <Inbox />}
      </span>
      <h2>{title}</h2>
      {children}
      {action && <div className="p-empty-action">{action}</div>}
    </section>
  );
}

/* ---------------------------------------------------------------- recovery -- */

export function SessionRecovery({ next = "/evaluation-entry" }: { next?: string }) {
  return (
    <div className="p-row" style={{ marginTop: 16 }}>
      <ActionLink href={evaluationSignInPath(next)}>{t("signIn")}</ActionLink>
      <ActionLink variant="ghost" href={evaluationRecoveryPath(next)}>
        {t("recovery")}
        <ChevronRight />
      </ActionLink>
    </div>
  );
}
