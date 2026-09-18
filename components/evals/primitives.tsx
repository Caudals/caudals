import type { ReactNode, ComponentProps } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { evaluationSignInPath, evaluationRecoveryPath } from "./auth-path";
import { t } from "@/lib/evals/messages/en";

export function Status({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={error ? "eval-status eval-status-error" : "eval-status"}
    >
      {children}
    </p>
  );
}
export function PageHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="eval-heading">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="eval-empty">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}
export function Field({
  label,
  id,
  ...props
}: ComponentProps<typeof Input> & { label: string; id: string }) {
  return (
    <div className="eval-field">
      <label htmlFor={id}>{label}</label>
      <Input id={id} {...props} />
    </div>
  );
}
export function DataTable({
  caption,
  headers,
  children,
}: {
  caption: string;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="eval-table-scroll"
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {headers.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function SessionRecovery({
  next = "/evaluation-entry",
}: {
  next?: string;
}) {
  return (
    <div className="eval-actions">
      <Button asChild>
        <Link href={evaluationSignInPath(next)}>{t("signIn")}</Link>
      </Button>
      <Link href={evaluationRecoveryPath(next)}>{t("recovery")}</Link>
    </div>
  );
}
