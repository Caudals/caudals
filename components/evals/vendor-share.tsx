"use client";

/**
 * "Send to my vendor" (launch P-54): the owner creates a private link limited
 * to the report's fix list and its evidence. It is an ordinary bearer share
 * whose only recorded field is `fix_list`, so expiry presets, open counts
 * (`share_access_event`) and revocation work as for any share. The preview is
 * the vendor's page itself, built from the same projection the server uses.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Send } from "lucide-react";
import { evalRequest, EvalRequestError } from "./api";
import { Action, DataTable, FilterChips, RowTitle, SectionHeading, Status, Time } from "./primitives";
import { CopyField, Modal, SidePanel, notify } from "./overlays";
import { SHARE_EXPIRY_PRESETS, isFixListLink, openedLabel, type ShareExpiry, type ShareLink } from "./share-links";
import { VendorFixList } from "./vendor-fix-list";
import { getLocale, t, tv } from "@/lib/evals/messages/runtime";
import type { ReportSnapshot } from "@/lib/evals/reports/contracts";
import { answerCount, buildFixes } from "@/lib/evals/reports/fixes";
import { projectFixList } from "@/lib/evals/reports/fix-list-share";
import { FIX_LIST_SCOPE } from "@/lib/evals/reports/share-sections";

const message = (error: unknown) => (error instanceof EvalRequestError ? error.message : error instanceof Error ? error.message : t("error"));

/** The button beside "Fix these first" on the owner's report. */
export function SendToVendorButton({ onClick }: { onClick: () => void }) {
  return (
    <Action variant="secondary" size="sm" onClick={onClick} title={t("sendToVendorHelp")} data-send-to-vendor>
      <Send aria-hidden="true" />
      {t("sendToVendor")}
    </Action>
  );
}

export function VendorShareDialog({
  open,
  onOpenChange,
  orgId,
  reportId,
  revision,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  reportId: string;
  revision: { id: string; snapshot: ReportSnapshot };
}) {
  const [days, setDays] = useState<ShareExpiry>(30);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [link, setLink] = useState("");
  const [created, setCreated] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locale = getLocale();
  const projection = useMemo(() => projectFixList(revision.snapshot), [revision.snapshot]);
  const fixes = useMemo(() => buildFixes(projection.results, locale), [projection, locale]);

  const load = useCallback(async () => {
    const shares = await evalRequest<ShareLink[]>(`/reports/${reportId}/shares?orgId=${encodeURIComponent(orgId)}`).catch(() => []);
    setLinks(shares.filter((share) => isFixListLink(share) && !share.revoked_at));
  }, [orgId, reportId]);
  useEffect(() => {
    if (!open) return;
    setCreated(false);
    setLink("");
    setError("");
    void load();
  }, [open, load]);

  async function create() {
    setPending(true);
    setError("");
    try {
      const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      const result = await evalRequest<{ id: string; token: string | null }>(
        `/reports/${reportId}/shares`,
        "POST",
        { orgId, reportRevisionId: revision.id, audience: "bearer", expiresAt, permittedFields: [FIX_LIST_SCOPE] },
        crypto.randomUUID(),
      );
      setLink(result.token ? `${window.location.origin}/share/fixes#token=${result.token}` : "");
      setCreated(true);
      await load();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(false);
    }
  }
  async function revoke(id: string) {
    setPending(true);
    try {
      await evalRequest(`/shares/${id}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      notify(t("shareRevokedNotice"));
      await load();
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(false);
    }
  }
  const answers = answerCount(projection.results.length, locale);
  const count = fixes.length === 1 ? t("vendorFixesOne") : tv("vendorFixesMany", { n: fixes.length });

  return (
    <>
      <Modal
        open={open && !preview}
        onOpenChange={onOpenChange}
        size="lg"
        title={created ? t("vendorCreatedTitle") : t("vendorDialogTitle")}
        description={created ? (link ? t("vendorLinkOnce") : t("shareCreated")) : t("vendorDialogDescription")}
        footer={
          created ? (
            <Action onClick={() => onOpenChange(false)}>{t("done")}</Action>
          ) : (
            <>
              <Action variant="ghost" onClick={() => setPreview(true)} disabled={!fixes.length}>
                <Eye aria-hidden="true" />
                {t("vendorPreview")}
              </Action>
              <span className="p-toolbar-spacer" />
              <Action variant="secondary" onClick={() => onOpenChange(false)}>
                {t("cancel")}
              </Action>
              <Action onClick={() => void create()} disabled={pending || !fixes.length}>
                {pending ? t("working") : t("vendorCreate")}
              </Action>
            </>
          )
        }
      >
        {error && <Status error>{error}</Status>}
        {created ? (
          link ? <CopyField label={t("shareLink")} value={link} hint={t("downloadWarning")} /> : <Status tone="success">{t("shareCreated")}</Status>
        ) : (
          <div className="p-stack" data-vendor-share>
            <p>
              <strong>{t("vendorIncludesTitle")}:</strong> {tv("vendorIncludes", { fixes: count, answers })}
            </p>
            <p>
              <strong>{t("vendorExcludesTitle")}:</strong> {t("vendorExcludes")}
            </p>
            <p className="p-field-hint">{t("vendorPartnerNote")}</p>
            <div className="p-field">
              <span>{t("shareExpiresAfter")}</span>
              <FilterChips
                value={String(days) as `${ShareExpiry}`}
                onChange={(value) => setDays(Number(value) as ShareExpiry)}
                label={t("shareExpiresAfter")}
                options={SHARE_EXPIRY_PRESETS.map((preset) => ({ value: String(preset) as `${ShareExpiry}`, label: tv("shareExpiryPreset", { days: preset }) }))}
              />
            </div>
          </div>
        )}
        {links.length > 0 && (
          <div>
            <SectionHeading title={t("vendorActiveLinks")} />
            <DataTable caption={t("vendorActiveLinks")} headers={[t("expires"), t("shareOpens"), { label: t("actions"), align: "end", hidden: true }]}>
              {links.map((share) => (
                <tr key={share.id} data-vendor-link={share.id}>
                  <RowTitle>
                    <Time value={share.expires_at} withTime={false} />
                  </RowTitle>
                  <td className="p-cell-meta" data-opens={share.open_count ?? share.access_count}>{openedLabel(share)}</td>
                  <td className="p-table-action">
                    <Action variant="ghost" size="sm" disabled={pending} onClick={() => void revoke(share.id)}>
                      {t("revokeShare")}
                    </Action>
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </Modal>
      <SidePanel open={open && preview} onOpenChange={(value) => !value && setPreview(false)} title={t("vendorPreview")} description={t("vendorPreviewBanner")} wide>
        <div className="vf vf-preview" data-vendor-preview>
          <div className="vf-main">
            <VendorFixList data={projection} preview />
          </div>
        </div>
      </SidePanel>
    </>
  );
}
