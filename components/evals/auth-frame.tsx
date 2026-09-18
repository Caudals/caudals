import type { ReactNode } from "react";
import { PageHeading } from "./primitives";
import { t } from "@/lib/evals/messages/en";
export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="eval-shell" lang="en">
      <main className="eval-public">
        <div className="eval-auth">
          <p className="eval-brand">{t("brand")}</p>
          <PageHeading title={title}>{description}</PageHeading>
          <section className="eval-panel">{children}</section>
        </div>
      </main>
    </div>
  );
}
