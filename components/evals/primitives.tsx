/**
 * Platform UI kit.
 *
 * Every authenticated Caudals surface composes from these. The visual contract
 * lives in `packages/brand/platform.css` — these components only choose the
 * right class and the right semantics. If a screen needs a look that is not
 * here, add it here and to DESIGN.md rather than styling inline.
 */
import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Inbox,
  Info,
  TriangleAlert,
} from "lucide-react";
import { evaluationSignInPath, evaluationRecoveryPath } from "./auth-path";
import { t } from "@/lib/evals/messages/en";

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

/** Filter/segment chip: the `+ Method` affordance across the toolbars. */
export function Chip({ active, ...props }: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className="p-chip"
      {...(active ? { "data-active": "true" } : {})}
      {...props}
    />
  );
}

/* ------------------------------------------------------------ page layout -- */

export function PageHeading({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="p-head">
      <div className="p-head-text">
        <h1>{title}</h1>
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
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="p-section-head">
      <div className="p-head-text">
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {actions}
    </div>
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
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>;
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
        </button>
      ))}
    </div>
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
  ready: { tone: "pass", label: "Ready" },
  needs_review: { tone: "warn", label: "Needs review" },
  needs_input: { tone: "warn", label: "Needs input" },
  validating: { tone: "info", label: "Validating" },
  checking_connection: { tone: "info", label: "Checking connection" },
  generating: { tone: "info", label: "Generating" },
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
  succeeded: { tone: "pass", label: "Passed" },
  pending: { tone: "neutral", label: "Pending" },
  // connections + runners
  connected: { tone: "pass", label: "Connected" },
  unsupported: { tone: "fail", label: "Unsupported" },
  target_error: { tone: "fail", label: "System error" },
  transport_error: { tone: "fail", label: "Transport error" },
  timeout: { tone: "fail", label: "Timed out" },
  capture_incomplete: { tone: "warn", label: "Capture incomplete" },
  unknown_external_outcome: { tone: "neutral", label: "Unknown outcome" },
  pairing_required: { tone: "warn", label: "Pairing required" },
  runner_wait: { tone: "warn", label: "Awaiting runner" },
  // reports
  published: { tone: "pass", label: "Published" },
  draft: { tone: "neutral", label: "Draft" },
  // severities
  critical: { tone: "fail", label: "Critical" },
  high: { tone: "fail", label: "High" },
  medium: { tone: "warn", label: "Medium" },
  low: { tone: "neutral", label: "Low" },
  pass: { tone: "pass", label: "Pass" },
  fail: { tone: "fail", label: "Fail" },
  assigned: { tone: "info", label: "Assigned" },
  in_progress: { tone: "info", label: "In progress" },
  conflict: { tone: "fail", label: "Save conflict" },
  guideline_changed: { tone: "warn", label: "Guideline changed" },
  submitted: { tone: "info", label: "Submitted" },
  in_review: { tone: "info", label: "In review" },
  changes_requested: { tone: "warn", label: "Changes requested" },
  approved: { tone: "pass", label: "Approved" },
  rejected: { tone: "fail", label: "Rejected" },
  adjudicated: { tone: "strong", label: "Adjudicated" },
};

export function humanize(value: string) {
  const known = STATUS[value];
  if (known) return known.label;
  const words = value.replaceAll("_", " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : value;
}

export function toneFor(value: string): Tone {
  return STATUS[value]?.tone ?? "neutral";
}

const LIVE = new Set(["running", "queued", "validating", "generating", "checking_connection"]);

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
export function StatusBadge({ value, fallback }: { value: string | null | undefined; fallback?: string }) {
  if (!value) return <span className="p-cell-meta">{fallback ?? t("notAvailable")}</span>;
  return (
    <Badge tone={toneFor(value)} dot live={LIVE.has(value)}>
      {humanize(value)}
    </Badge>
  );
}

/* ---------------------------------------------------------------- status -- */

export function Status({
  children,
  error = false,
  tone,
}: {
  children: ReactNode;
  error?: boolean;
  tone?: "error" | "success" | "warn" | "info";
}) {
  const resolved = tone ?? (error ? "error" : undefined);
  const Icon =
    resolved === "error" ? AlertCircle : resolved === "success" ? Check : resolved === "warn" ? TriangleAlert : Info;
  return (
    <p
      role={resolved === "error" ? "alert" : "status"}
      className="p-status"
      {...(resolved ? { "data-tone": resolved } : {})}
    >
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Indeterminate wait. Reads as a sentence, not a bare spinner. */
export function Loading({ children }: { children?: ReactNode }) {
  return (
    <p className="p-status" role="status">
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

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="p-grid">{children}</div>;
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

/* ----------------------------------------------------------------- forms -- */

export function Field({
  label,
  id,
  hint,
  ...props
}: ComponentProps<"input"> & { label: string; id: string; hint?: string }) {
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
}: ComponentProps<"textarea"> & { label: string; id: string; hint?: string }) {
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
}: ComponentProps<"select"> & { label: string; id: string; hint?: string }) {
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

/** Compact inline select for toolbars, where the label sits beside the control. */
export function InlineSelect({
  label,
  id,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; id: string }) {
  return (
    <>
      <label className="p-toolbar-label" htmlFor={id}>
        {label}
      </label>
      <div className="p-field" style={{ minWidth: 180, maxWidth: 260 }}>
        <select id={id} aria-label={label} {...props}>
          {children}
        </select>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- tables -- */

export function DataTable({
  caption,
  headers,
  children,
}: {
  caption: string;
  headers: Array<string | { label: string; align?: "end" }>;
  children: ReactNode;
}) {
  return (
    <div className="p-table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="p-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((header) => {
              const label = typeof header === "string" ? header : header.label;
              const end = typeof header !== "string" && header.align === "end";
              return (
                <th scope="col" key={label} className={end ? "p-table-action" : undefined}>
                  {label}
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

/** Row header cell with an optional second line of context. */
export function RowTitle({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <th scope="row">
      <span className="p-table-primary">
        <span>{children}</span>
        {meta && <span className="p-cell-meta">{meta}</span>}
      </span>
    </th>
  );
}

/* ----------------------------------------------------------- empty state -- */

export function EmptyState({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="p-empty">
      <span className="p-empty-mark" aria-hidden="true">
        {icon ?? <Inbox />}
      </span>
      <h2>{title}</h2>
      {children}
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
