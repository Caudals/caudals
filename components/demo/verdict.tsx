import type { Verdict } from "@/lib/demo/judge";

/**
 * Ink-only verdict marks, always beside a word (DESIGN.md §13): an outlined
 * tick, a solid cross, a half-filled disc for a partial answer, a dash for
 * no answer and a dotted ring for a result that is not scored.
 */
export function VerdictMark({ verdict, className = "dm-mark" }: { verdict: Verdict; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      {verdict === "correct" && (
        <>
          <circle cx="10" cy="10" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M6 10.4l2.6 2.6 5.6-5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {verdict === "incorrect" && (
        <>
          <circle cx="10" cy="10" r="10" fill="currentColor" />
          <path d="M6.9 6.9l6.2 6.2M13.1 6.9l-6.2 6.2" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {verdict === "partial" && (
        <>
          <circle cx="10" cy="10" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M10 0.75a9.25 9.25 0 0 1 0 18.5z" fill="currentColor" />
        </>
      )}
      {verdict === "no_answer" && (
        <>
          <circle cx="10" cy="10" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <path d="M6.5 10h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {verdict === "unscored" && (
        <circle cx="10" cy="10" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2.2 2.4" />
      )}
    </svg>
  );
}
