/**
 * Data graphics for evaluation results. HTML rather than canvas so every
 * figure stays selectable text, scales with the page and prints cleanly.
 * Every graphic carries its numbers as text as well — colour and length are
 * never the only encoding.
 */

export type OutcomeCounts = { pass: number; partial: number; fail: number; unscorable: number };

const OUTCOMES = [
  { key: "pass", label: "Pass", tone: "pass" },
  { key: "partial", label: "Partial", tone: "warn" },
  { key: "fail", label: "Fail", tone: "fail" },
  { key: "unscorable", label: "Not scored", tone: "neutral" },
] as const;

/** One bar split by outcome, with a legend that carries the counts. */
export function OutcomeBar({
  counts,
  label,
  labels,
}: {
  counts: OutcomeCounts;
  label: string;
  /** Relabel the segments (e.g. execution states); a segment whose label is `null` is left out. */
  labels?: Partial<Record<keyof OutcomeCounts, string | null>>;
}) {
  const outcomes = OUTCOMES.filter((item) => labels?.[item.key] !== null).map((item) => ({ ...item, label: labels?.[item.key] ?? item.label }));
  const total = outcomes.reduce((sum, item) => sum + counts[item.key], 0);
  const description = outcomes.map((item) => `${counts[item.key]} ${item.label.toLowerCase()}`).join(", ");
  return (
    <figure className="p-outcomes">
      <div className="p-outcomes-bar" role="img" aria-label={`${label}: ${description}, of ${total}.`}>
        {total === 0 ? (
          <span data-tone="empty" style={{ flexGrow: 1 }} />
        ) : (
          outcomes.filter((item) => counts[item.key] > 0).map((item) => (
            <span key={item.key} data-tone={item.tone} style={{ flexGrow: counts[item.key] }} />
          ))
        )}
      </div>
      <figcaption className="p-legend">
        {outcomes.map((item) => (
          <span key={item.key} className="p-legend-item">
            <span className="p-legend-swatch" data-tone={item.tone} aria-hidden="true" />
            {item.label}
            <strong>{counts[item.key]}</strong>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/**
 * Ranked horizontal bars — pass rate by topic, failures by severity. Each row
 * states its value and denominator; the bar is a reading aid, not the data.
 */
export function BarList({
  items,
  label,
  format = "ratio",
}: {
  items: ReadonlyArray<{ label: string; value: number; total: number; tone?: "pass" | "warn" | "fail" | "neutral" }>;
  label: string;
  format?: "ratio" | "count";
}) {
  const max = Math.max(1, ...items.map((item) => (format === "ratio" ? item.total : item.value)));
  return (
    <ul className="p-barlist" aria-label={label}>
      {items.map((item) => {
        const share = format === "ratio" ? (item.total ? item.value / item.total : 0) : item.value / max;
        return (
          <li key={item.label}>
            <span className="p-barlist-label">{item.label}</span>
            <span className="p-barlist-track" aria-hidden="true">
              <span data-tone={item.tone ?? "neutral"} style={{ width: `${Math.round(share * 100)}%` }} />
            </span>
            <span className="p-barlist-value">
              {format === "ratio" ? (
                <>
                  {item.total ? `${Math.round((item.value / item.total) * 100)}%` : "—"}
                  <small>
                    {item.value}/{item.total}
                  </small>
                </>
              ) : (
                item.value
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** A single proportion as a thin meter with its value beside it. */
export function Meter({ value, label, tone = "neutral" }: { value: number | null; label: string; tone?: "pass" | "warn" | "fail" | "neutral" }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <span className="p-meter">
      <span className="p-meter-track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
        <span data-tone={tone} style={{ width: `${Math.round(pct * 100)}%` }} />
      </span>
      <span className="p-meter-value">{value == null ? "—" : `${Math.round(pct * 100)}%`}</span>
    </span>
  );
}

export function percent(value: number | null | undefined, digits = 0) {
  return value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
}
