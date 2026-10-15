"use client";

import { FileQuestionMark } from "lucide-react";
import { ActionLink, EmptyState, PageHeading } from "./primitives";
import { usePageCrumb } from "./workspace-context";
import { t } from "@/lib/evals/messages/runtime";

/**
 * A page inside the signed-in app that called `notFound()`: an unknown help
 * article, a page behind a flag that is off, a role that cannot open it. It
 * stays in the shell (sidebar, breadcrumbs, search) with one way back, rather
 * than Next's bare 404 outside the app.
 */
export function AppNotFound() {
  usePageCrumb(t("pageNotFound"));
  return (
    <>
      <PageHeading title={t("pageNotFound")} />
      <EmptyState
        title={t("pageNotFoundTitle")}
        icon={<FileQuestionMark />}
        action={<ActionLink href="/evaluation-entry">{t("pageNotFoundAction")}</ActionLink>}
      >
        <p>{t("pageNotFoundHelp")}</p>
      </EmptyState>
    </>
  );
}
