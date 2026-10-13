/**
 * Data graphics for evaluation results. HTML rather than canvas so every
 * figure stays selectable text, scales with the page and prints cleanly.
 * Every graphic carries its numbers as text as well — colour and length are
 * never the only encoding.
 */
import { tr } from "@/lib/evals/messages/phrases";

export type OutcomeCounts = { pass: number; partial: number; fail: number; unscorable: number };

const OUTCOMES = [
  { key: "pass", label: tr("Pass"), tone: "pass" },
  { key: "partial", label: tr("Partial"), tone: "warn" },
  { key: "fail", label: tr("Fail"), tone: "fail" },
  { key: "unscorable", label: tr("Not scored"), tone: "neutral" },
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

/**
 * One stacked bar per group (a severity, a topic): how many answers passed,
 * were partly right or failed, side by side. A pass rate alone hides that
 * "70 % at critical" can be three failures that each matter; the stack shows
 * them, and the row states the failing count in words.
 */
export function StackedBars({
  rows,
  label,
}: {
  rows: ReadonlyArray<{ label: string; counts: OutcomeCounts }>;
  label: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.counts.pass + row.counts.partial + row.counts.fail));
  return (
    <ul className="p-stacks" aria-label={label}>
      {rows.map((row) => {
        const total = row.counts.pass + row.counts.partial + row.counts.fail;
        const wrong = row.counts.fail + row.counts.partial;
        const description = OUTCOMES.filter((item) => item.key !== "unscorable").map((item) => `${row.counts[item.key]} ${item.label.toLowerCase()}`).join(", ");
        return (
          <li key={row.label}>
            <span className="p-stacks-label">{row.label}</span>
            <span className="p-stacks-track" role="img" aria-label={`${row.label}: ${description}.`} style={{ width: `${Math.round((total / max) * 100)}%` }}>
              {OUTCOMES.filter((item) => item.key !== "unscorable" && row.counts[item.key] > 0).map((item) => (
                <span key={item.key} data-tone={item.tone} style={{ flexGrow: row.counts[item.key] }} />
              ))}
            </span>
            <span className="p-stacks-value" data-tone={wrong > 0 ? (row.counts.fail > 0 ? "fail" : "warn") : "pass"}>
              {total ? `${Math.round((row.counts.pass / total) * 100)}%` : "—"}
              <small>{wrong > 0 ? `${wrong}/${total} ${tr("not right")}` : `${total}/${total}`}</small>
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

/**
 * One column per day, a single series (launch L-15: credits used per day).
 * Columns grow from one hairline baseline, at most 24px wide with a 2px gap,
 * square at the base and rounded at the top. Only the peak carries its value;
 * every day's value is in its tooltip and in the table under the chart, so
 * the figure never depends on reading bar heights.
 */
export function DayBars({
  days,
  label,
  format,
  tableLabel,
  dayLabel,
  valueLabel,
}: {
  days: ReadonlyArray<{ day: string; value: number }>;
  label: string;
  format: (value: number) => string;
  tableLabel: string;
  dayLabel: (day: string) => string;
  valueLabel: string;
}) {
  const max = Math.max(0, ...days.map((item) => item.value));
  const peak = max > 0 ? days.findIndex((item) => item.value === max) : -1;
  const total = days.reduce((sum, item) => sum + item.value, 0);
  const summary = peak >= 0 ? `${label}: ${format(total)}; ${dayLabel(days[peak].day)} ${format(max)}.` : `${label}: ${format(0)}.`;
  return (
    <figure className="p-daybars">
      <div className="p-daybars-plot" role="img" aria-label={summary}>
        {days.map((item, index) => (
          <span key={item.day} className="p-daybars-col" title={`${dayLabel(item.day)} · ${format(item.value)}`}>
            {index === peak && <span className="p-daybars-peak">{format(item.value)}</span>}
            <span className="p-daybars-bar" data-empty={item.value <= 0 ? "true" : undefined} style={{ height: `${max > 0 ? Math.max(item.value > 0 ? 2 : 0, Math.round((item.value / max) * 100)) : 0}%` }} />
          </span>
        ))}
      </div>
      {days.length > 0 && (
        <figcaption className="p-daybars-axis">
          <span>{dayLabel(days[0].day)}</span>
          <span>{dayLabel(days[days.length - 1].day)}</span>
        </figcaption>
      )}
      <details className="p-daybars-table">
        <summary>{tableLabel}</summary>
        <table className="p-table">
          <thead><tr><th scope="col">{tableLabel}</th><th scope="col" className="p-table-action">{valueLabel}</th></tr></thead>
          <tbody>
            {days.filter((item) => item.value > 0).map((item) => (
              <tr key={item.day}><th scope="row">{dayLabel(item.day)}</th><td className="p-table-action">{format(item.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
