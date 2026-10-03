import { useEffect, useMemo, useState } from "react";
import { useBlocker, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCheck, Circle, Eye, Loader2, Mail, RotateCcw, Save, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { useCampaign } from "@/hooks/context/campaign";
import { usePermission } from "@/hooks/usePermission";
import { useCampaignSenderInboxes } from "@/components/app/campaigns/sequences/previewContext";
import Request from "@/lib/api/client/Request";
import searchContacts from "@/lib/api/client/app/contacts/searchContacts";
import getContact from "@/lib/api/client/app/contacts/getContact";
import updateContact from "@/lib/api/client/app/contacts/updateContact";
import getCampaign from "@/lib/api/client/app/campaigns/getCampaign";
import getSequences from "@/lib/api/client/app/campaigns/sequences/getSequences";
import updateSequence from "@/lib/api/client/app/campaigns/sequences/updateSequence";
import getEmail from "@/lib/api/client/app/emails/getEmail";
import { listABVariants } from "@/lib/api/client/app/campaigns/abVariants";
import type { TemplatePreview } from "@/lib/api/client/app/campaigns/previewTemplate";
import type Contact from "@/lib/api/models/app/contacts/Contact";
import type Sequence from "@/lib/api/models/app/campaigns/sequences/Sequence";
import type Inbox from "@/lib/api/models/app/emails/Inbox";
import type Campaign from "@/lib/api/models/app/campaigns/Campaign";
import { editingPatch, reviewKeys, reviewVersion, sameRevision, savedReview, sharedCopy, stepRevision, subjectTemplate, wrapCopy } from "./reviewModel";
import { Button } from "@/components/ui/button";
import { SearchInput, TextInput } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ScrollStrip from "@/components/ui/scroll-strip";
import { useConfirm } from "@/hooks/context/confirm";
import toast from "react-hot-toast";
import "./reviewer.css";

async function loadLeads(campaignId: string): Promise<Contact[]> {
    const result: Contact[] = [];
    let cursor: string | null = null;
    do {
        const page = await searchContacts({ query: "", campaign_ids: [campaignId], custom_field_filters: [], sort_by: "created_at", reverse: false }, cursor, 100);
        result.push(...page.data);
        cursor = page.pagination.has_more ? page.pagination.next_cursor : null;
    } while (cursor);
    return result;
}

function message(error: unknown): string {
    if (error && typeof error === "object" && "message" in error) return String(error.message);
    return "Could not load the email. Please try again.";
}

function valid(preview: TemplatePreview | null): boolean {
    return !!preview && !preview.errors?.length && !preview.unresolved?.length;
}

function reviewSettings(campaign: Campaign): string {
    return JSON.stringify([campaign.unsubscribe_mode, campaign.text_only, campaign.unsubscribe_header]);
}

function mergeFields(contact: Contact, patch: Record<string, string>): Contact {
    const fields = { ...contact.custom_fields };
    for (const [key, value] of Object.entries(patch)) {
        if (value === "") delete fields[key];
        else fields[key] = value;
    }
    return { ...contact, custom_fields: fields };
}

export default function EmailReviewer() {
    const campaign = useCampaign();
    const cid = campaign?.id ?? "";
    const client = useQueryClient();
    const confirm = useConfirm();
    const [params, setParams] = useSearchParams();
    const [pickedContact, setPickedContact] = useState(params.get("contact") ?? "");
    const [pickedStep, setPickedStep] = useState(params.get("step") ?? "");
    const [senderId, setSenderId] = useState("");
    const [search, setSearch] = useState("");
    const [pendingOnly, setPendingOnly] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [epoch, setEpoch] = useState(0);
    const [reviewed, setReviewed] = useState<Record<string, boolean[]>>({});
    const contacts = useQuery({ queryKey: ["email-review-leads", cid], queryFn: () => loadLeads(cid), enabled: !!cid });
    const sequences = useQuery({ queryKey: ["email-review-steps", cid], queryFn: () => getSequences(cid), enabled: !!cid });
    const variants = useQuery({ queryKey: ["email-review-variants", cid], queryFn: () => listABVariants(cid), enabled: !!cid });
    const senders = useCampaignSenderInboxes(cid);
    const canWrite = usePermission("MANAGE_CONTACTS");
    const canChangeSteps = usePermission("MANAGE_SEQUENCES");
    const leads = useMemo(() => contacts.data ?? [], [contacts.data]);
    const steps = useMemo(() => (sequences.data ?? []).filter((s) => s.kind === "email"), [sequences.data]);
    const contact = leads.find((c) => c.id === pickedContact) ?? leads[0];
    const stepIndex = Math.max(0, steps.findIndex((s) => s.id === pickedStep));
    const sender = senders.inboxes.find((s) => s.id === senderId) ?? senders.inboxes[0];
    const settings = campaign ? reviewSettings(campaign) : "";
    const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

    useEffect(() => {
        if (!sender || !steps.length) return;
        let current = true;
        Promise.all(leads.map(async (lead) => [lead.id, await Promise.all(steps.map(async (step, index) => savedReview(lead.custom_fields, step.id)?.version === await reviewVersion(lead, steps, index, sender, settings)))] as const)).then((rows) => {
            if (current) setReviewed(Object.fromEntries(rows));
        });
        return () => { current = false; };
    }, [leads, steps, sender, settings]);

    useEffect(() => {
        const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
        window.addEventListener("beforeunload", leave);
        return () => window.removeEventListener("beforeunload", leave);
    }, [dirty]);

    function choose(contactId: string, stepId: string, mailboxId = sender?.id ?? "", savedAlready = false) {
        const apply = () => {
            setDirty(false);
            setPickedContact(contactId); setPickedStep(stepId); setSenderId(mailboxId);
            const next = new URLSearchParams(params);
            next.set("contact", contactId); next.set("step", stepId);
            setParams(next, { replace: true });
        };
        if (dirty && !savedAlready) confirm.show("Discard the unsaved changes to this email?", apply);
        else apply();
    }

    const completed = leads.filter((c) => reviewed[c.id]?.length === steps.length && reviewed[c.id]?.every(Boolean)).length;
    const visible = leads.filter((c) => (!pendingOnly || !reviewed[c.id]?.every(Boolean)) && `${c.company} ${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(search.toLowerCase()));
    const loading = contacts.isLoading || sequences.isLoading || variants.isLoading || senders.loading;
    const failed = contacts.error || sequences.error || variants.error;

    function saved(updated: Contact, updatedSteps: Sequence[], next: boolean) {
        client.setQueryData<Contact[]>(["email-review-leads", cid], (old) => (old ?? []).map((c) => c.id === updated.id ? updated : c));
        client.setQueryData<Sequence[]>(["email-review-steps", cid], (old) => (old ?? []).map((s) => updatedSteps.find((u) => u.id === s.id) ?? s));
        void client.invalidateQueries({ queryKey: ["contacts"] });
        setDirty(false); setEpoch((v) => v + 1);
        if (next && steps[stepIndex + 1]) choose(updated.id, steps[stepIndex + 1].id, sender?.id, true);
        else if (next) {
            const index = visible.findIndex((c) => c.id === updated.id);
            const following = visible[index + 1] ?? visible.find((c) => c.id !== updated.id && !reviewed[c.id]?.every(Boolean));
            if (following) choose(following.id, steps[0].id, sender?.id, true);
        }
    }

    if (!campaign || loading) return <div className="cr-loading"><Loader2 className="animate-spin" size={22} />Loading your emails…</div>;
    if (failed) return <div className="cr-notice" role="alert">{message(failed)} <button onClick={() => { void contacts.refetch(); void sequences.refetch(); void variants.refetch(); }}>Try again</button></div>;
    if (!steps.length || !leads.length) return <div className="cr-empty"><Mail size={30} /><h2>No emails to review yet</h2><p>Add leads and an email step to this campaign.</p></div>;
    const abEnabled = (variants.data ?? []).some((v) => v.is_active && v.weight > 0);

    const visibleIndex = visible.findIndex((lead) => lead.id === contact?.id);
    return <section className="cr-root" aria-label="Email reviewer">
        <header className="cr-heading">
            <div><h2>Review emails</h2><p>Edit and review each lead’s first email and follow-ups.</p></div>
            <span className="cr-progress"><CheckCheck size={13} />{completed} of {leads.length} leads reviewed</span>
        </header>
        <div className="cr-mobile-lead">
            <span>Lead</span>
            <Select value={contact.id} onValueChange={(id) => choose(id, steps[stepIndex].id)}>
                <SelectTrigger aria-label="Select lead" className="cr-select"><SelectValue /></SelectTrigger>
                <SelectContent>{leads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.company || lead.email} · {`${lead.first_name} ${lead.last_name}`.trim()}</SelectItem>)}</SelectContent>
            </Select>
        </div>
        <div className="cr-workbench">
            <aside className="cr-leads" aria-label="Campaign leads">
                <div className="cr-list-heading"><span>Leads</span><span>{visible.length}</span></div>
                <SearchInput placeholder="Search leads…" value={search} onChange={setSearch} />
                <label className="cr-filter"><Checkbox tone="slate" size="xs" checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} />Needs review only</label>
                <div className="cr-lead-list">{visible.map((lead) => {
                    const count = reviewed[lead.id]?.filter(Boolean).length ?? 0;
                    return <button key={lead.id} className={`cr-lead ${contact?.id === lead.id ? "is-selected" : ""}`} aria-pressed={contact?.id === lead.id} onClick={() => choose(lead.id, steps[stepIndex].id)}>
                        <span className="cr-lead-copy"><span className="cr-lead-company">{lead.company || lead.email}</span><span className="cr-lead-person">{`${lead.first_name} ${lead.last_name}`.trim() || lead.email}</span></span>
                        <span className={`cr-lead-status ${count === steps.length ? "is-reviewed" : ""}`} title={`${count} of ${steps.length} emails reviewed`}>{count === steps.length ? <CheckCheck size={13} /> : <span>{count}/{steps.length}</span>}</span>
                    </button>;
                })}{!visible.length && <p className="cr-small">No leads match your search.</p>}</div>
            </aside>
            <main className="cr-main">
                <div className="cr-recipient">
                    <div className="cr-recipient-copy"><strong>{contact.company || `${contact.first_name} ${contact.last_name}`.trim()}</strong><span>{contact.first_name} {contact.last_name} <span>·</span> {contact.email}</span></div>
                    <div className="cr-lead-nav"><Button variant="ghost" size="icon-xs" aria-label="Previous lead" disabled={visibleIndex <= 0} onClick={() => choose(visible[visibleIndex - 1].id, steps[stepIndex].id)}><ChevronLeft /></Button><span>{visibleIndex >= 0 ? `${visibleIndex + 1} / ${visible.length}` : "Filtered"}</span><Button variant="ghost" size="icon-xs" aria-label="Next lead" disabled={visibleIndex < 0 || visibleIndex >= visible.length - 1} onClick={() => choose(visible[visibleIndex + 1].id, steps[stepIndex].id)}><ChevronRight /></Button></div>
                </div>
                <div className="cr-sender"><span>From</span><Select value={sender?.id ?? ""} onValueChange={(id) => choose(contact.id, steps[stepIndex].id, id)}><SelectTrigger aria-label="Preview sender" className="cr-select"><SelectValue /></SelectTrigger><SelectContent>{senders.inboxes.map((s) => <SelectItem key={s.id} value={s.id}>{s.email}</SelectItem>)}</SelectContent></Select></div>
                <nav aria-label="Emails in sequence"><ScrollStrip activeKey={steps[stepIndex].id} className="cr-tab-strip" innerClassName="cr-email-tabs">{steps.map((step, index) => <button key={step.id} className={stepIndex === index ? "is-selected" : ""} data-active={stepIndex === index} aria-pressed={stepIndex === index} onClick={() => choose(contact.id, step.id)}>
                    {reviewed[contact.id]?.[index] ? <Check size={13} /> : <Mail size={13} />}{index === 0 ? "First email" : `Follow-up ${index}`}<span className="cr-step-delay">{index > 0 && `+${step.wait_after}d`}</span>
                </button>)}</ScrollStrip></nav>
                {!sender ? <div className="cr-notice">Assign a campaign sender to preview the full email and its signature.</div> : <MessageEditor key={`${contact.id}:${steps[stepIndex].id}:${sender.id}:${epoch}`} campaign={campaign} contact={contact} steps={steps} index={stepIndex} sender={sender} canWrite={canWrite} canChangeSteps={canChangeSteps} abEnabled={abEnabled} reviewed={!!reviewed[contact.id]?.[stepIndex]} onDirty={setDirty} onSaved={saved} />}
            </main>
        </div>
        <Dialog open={blocker.state === "blocked"} onOpenChange={(open) => { if (!open && blocker.state === "blocked") blocker.reset(); }}>
            <DialogContent className="cr-leave-dialog"><DialogHeader><DialogTitle>Discard unsaved changes?</DialogTitle><DialogDescription>The changes to this email haven’t been saved.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" size="sm" onClick={() => { if (blocker.state === "blocked") blocker.reset(); }}>Keep editing</Button><Button size="sm" onClick={() => { if (blocker.state === "blocked") { setDirty(false); blocker.proceed(); } }}>Discard and leave</Button></DialogFooter></DialogContent>
        </Dialog>
    </section>;
}

function MessageEditor({ campaign, contact, steps, index, sender, canWrite, canChangeSteps, abEnabled, reviewed, onDirty, onSaved }: { campaign: Campaign; contact: Contact; steps: Sequence[]; index: number; sender: Inbox; canWrite: boolean; canChangeSteps: boolean; abEnabled: boolean; reviewed: boolean; onDirty: (v: boolean) => void; onSaved: (contact: Contact, steps: Sequence[], next: boolean) => void }) {
    const [baseline] = useState(contact);
    const [baselineSteps] = useState(steps);
    const step = baselineSteps[index];
    const keys = reviewKeys(step.id);
    const [body, setBody] = useState("");
    const [subject, setSubject] = useState("");
    const [initial, setInitial] = useState<{ body: string; subject: string } | null>(null);
    const [preview, setPreview] = useState<TemplatePreview | null>(null);
    const [error, setError] = useState("");
    const [previewError, setPreviewError] = useState("");
    const [busy, setBusy] = useState(false);
    const [previewBusy, setPreviewBusy] = useState(true);
    const [previewOnly, setPreviewOnly] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [retry, setRetry] = useState(0);
    const subjectLocked = step.thread_reply && index > 0;
    const customized = !!baseline.custom_fields[keys.body] || !!baseline.custom_fields[keys.subject];
    const dirty = !!initial && (resetting || body !== initial.body || subject !== initial.subject);
    const sent = (contact.campaign_lead?.sent ?? 0) > index;
    const editable = canWrite && campaign.text_only && ["draft", "paused"].includes(campaign.status) && !abEnabled && !sent;
    const words = body.trim() ? body.trim().split(/\s+/).length : 0;

    useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

    useEffect(() => {
        let current = true;
        Request<TemplatePreview>({ method: "POST", url: "/campaign-template-preview", authorization: true, data: { subject: subjectTemplate(baselineSteps, index), body_plain: step.body_plain, body_html: "", contact_id: baseline.id } }).then((result) => {
            if (!valid(result)) throw new Error(result.errors?.join(" ") || "The email has unresolved personalization.");
            if (current) { setBody(result.body_plain); setSubject(result.subject); setInitial({ body: result.body_plain, subject: result.subject }); }
        }).catch((err: unknown) => { if (current) { setError(message(err)); setPreviewBusy(false); } });
        return () => { current = false; };
    }, [baseline, baselineSteps, index, step]);

    useEffect(() => {
        if (!initial) return;
        let current = true;
        const timer = window.setTimeout(() => {
            setPreviewBusy(true); setPreviewError("");
            const patch = editingPatch(step, body, subject);
            Request<TemplatePreview>({ method: "POST", url: "/campaign-template-preview", authorization: true, data: { subject: subjectLocked ? subjectTemplate(baselineSteps, index) : wrapCopy(step.subject, keys.subject), body_plain: wrapCopy(step.body_plain, keys.body), body_html: "", contact_id: baseline.id, contact: { custom_fields: patch }, campaign_id: campaign.id, step_id: step.id, account_id: sender.id } }).then((result) => { if (current) setPreview(result); }).catch((err: unknown) => { if (current) { setPreview(null); setPreviewError(message(err)); } }).finally(() => { if (current) setPreviewBusy(false); });
        }, 450);
        return () => { current = false; window.clearTimeout(timer); };
    }, [initial, body, subject, step, keys.body, keys.subject, baseline, baselineSteps, index, campaign.id, sender.id, subjectLocked, retry]);

    async function restoreShared() {
        setBusy(true); setError("");
        try {
            const result = await Request<TemplatePreview>({ method: "POST", url: "/campaign-template-preview", authorization: true, data: { subject: subjectLocked ? subjectTemplate(baselineSteps, index) : sharedCopy(step.subject, keys.subject), body_plain: sharedCopy(step.body_plain, keys.body), body_html: "", contact_id: baseline.id } });
            if (!valid(result)) throw new Error("The shared copy could not be rendered.");
            setBody(result.body_plain); setSubject(result.subject); setResetting(true);
        } catch (err) { setError(message(err)); } finally { setBusy(false); }
    }

    async function save(markReviewed: boolean) {
        if (!editable || busy || previewBusy || !valid(preview) || !body.trim() || !subject.trim()) return;
        setBusy(true); setError("");
        try {
            const currentCampaign = await getCampaign(campaign.id);
            if (!["draft", "paused"].includes(currentCampaign.status)) throw new Error("Pause this campaign before editing its emails.");
            if (reviewSettings(currentCampaign) !== reviewSettings(campaign)) throw new Error("Campaign settings changed. Reload before saving.");
            const fresh = await getContact(contact.id);
            if (!fresh.campaigns.some((c) => c.id === campaign.id)) throw new Error("This lead was removed from the campaign. Reload before saving.");
            if (!sameRevision(baseline, fresh)) throw new Error("This lead changed in another window. Reload before saving to keep both edits.");
            const freshSteps = (await getSequences(campaign.id)).filter((s) => s.kind === "email");
            if (freshSteps.length !== baselineSteps.length || freshSteps.some((s, i) => stepRevision(s) !== stepRevision(baselineSteps[i]))) throw new Error("The shared email sequence changed. Reload before saving.");
            const freshSender = await getEmail(sender.id);
            if (JSON.stringify([freshSender.signature_plain, freshSender.signature_html, freshSender.name, freshSender.email]) !== JSON.stringify([sender.signature_plain, sender.signature_html, sender.name, sender.email])) throw new Error("The sender signature changed. Reload before saving.");
            const activeVariants = await listABVariants(campaign.id);
            if (activeVariants.some((v) => v.is_active && v.weight > 0)) throw new Error("This campaign now uses A/B variants. Review them in Steps first.");
            const patch = resetting ? { [keys.body]: "", [keys.subject]: "", [keys.reviewed]: "" } : dirty ? editingPatch(step, body, subject) : { [keys.reviewed]: "" };
            let savedStep = freshSteps[index];
            if (dirty && !resetting) {
                const bodyTemplate = wrapCopy(savedStep.body_plain, keys.body);
                const subjectCopy = subjectLocked ? savedStep.subject : wrapCopy(savedStep.subject, keys.subject);
                if (new TextEncoder().encode(subjectCopy).length > 100) throw new Error("Shorten the shared subject in Steps before enabling individual edits; Warmbly limits subject templates to 100 bytes.");
                if (bodyTemplate !== savedStep.body_plain || subjectCopy !== savedStep.subject || savedStep.body_html || savedStep.body_sync) {
                    if (!canChangeSteps) throw new Error("An owner must enable individual editing for this step first.");
                    savedStep = await updateSequence(campaign.id, step.id, { body_plain: bodyTemplate, subject: subjectCopy, body_html: "", body_sync: false, body_code: false });
                    freshSteps[index] = savedStep;
                }
            }
            const proposed = mergeFields(fresh, patch);
            if (markReviewed) patch[keys.reviewed] = JSON.stringify({ version: await reviewVersion(proposed, freshSteps, index, freshSender, reviewSettings(currentCampaign)), at: new Date().toISOString() });
            const savedContact = await updateContact(contact.id, { custom_fields: patch });
            const live = await Request<TemplatePreview>({ method: "POST", url: "/campaign-template-preview", authorization: true, data: { subject: subjectTemplate(freshSteps, index), body_plain: savedStep.body_plain, body_html: "", contact_id: contact.id, campaign_id: campaign.id, step_id: step.id, account_id: sender.id } });
            if (!valid(live)) throw new Error("The edit was saved, but its preview needs attention. Reload to review it.");
            toast.success(markReviewed ? "Email marked as reviewed" : resetting ? "Original copy restored" : "Changes saved");
            onDirty(false);
            onSaved({ ...savedContact, campaign_lead: contact.campaign_lead }, freshSteps, markReviewed);
        } catch (err) { setError(message(err)); } finally { setBusy(false); }
    }

    const canSave = editable && !!initial && !busy && !previewBusy && valid(preview) && !!body.trim() && !!subject.trim();
    return <div className="cr-message-area">
        <div className="cr-editor-toolbar">
            <span className={`cr-status ${dirty ? "is-dirty" : reviewed ? "is-reviewed" : ""}`} role="status">{dirty ? <><Circle size={10} />Unsaved changes</> : reviewed ? <><CheckCheck size={13} />Reviewed</> : customized ? "Customized" : "Not reviewed"}</span>
            <div className="cr-view-switch" aria-label="Email view"><button aria-pressed={!previewOnly} onClick={() => setPreviewOnly(false)}><Pencil size={12} />Edit</button><button aria-pressed={previewOnly} onClick={() => setPreviewOnly(true)}><Eye size={12} />Preview</button></div>
        </div>
        {!editable && <p className="cr-notice">{sent ? "This email has already been sent. Editing is disabled." : abEnabled ? "This campaign uses A/B variants. Edit those variants in Steps." : !canWrite ? "Contact editing requires Manage contacts permission." : !campaign.text_only ? "Edit HTML campaigns in Steps." : "Pause the campaign before editing its emails."}</p>}
        {error && <div className="cr-error" role="alert">{error}</div>}
        {!initial ? <div className="cr-loading">{error ? "Select another email or reload to try again." : <><Loader2 className="animate-spin" size={16} />Loading email…</>}</div> : previewOnly ? <article className="cr-letter cr-full-preview" aria-label="Email preview">
            <dl className="cr-mail-header"><dt>From</dt><dd>{preview?.from?.name || sender.name} &lt;{preview?.from?.email || sender.email}&gt;</dd><dt>To</dt><dd>{contact.email}</dd><dt>Subject</dt><dd>{preview?.subject || subject}</dd></dl>
            {previewBusy && <p className="cr-small" role="status">Updating preview…</p>}<pre>{preview?.body_plain ?? "Preview is unavailable."}</pre>
        </article> : <article className="cr-letter" aria-label="Email composer">
            <label className="cr-subject"><span>Subject {subjectLocked && <small>Same thread as the first email</small>}</span><TextInput title="Email subject" value={subject} disabled={subjectLocked || !editable} maxLength={500} className="w-full" onChange={setSubject} /></label>
            <label className="cr-message-label" htmlFor="cr-email-body">Message</label><Textarea id="cr-email-body" className="cr-body-editor" aria-label="Email body" spellCheck value={body} readOnly={!editable} maxLength={40000} onChange={(e) => { setBody(e.target.value); setResetting(false); }} />
            <details className="cr-signature"><summary>Sender signature <span>Added automatically</span></summary><pre>{sender.signature_plain || sender.name}</pre></details>
        </article>}
        {previewError && <div className="cr-error" role="alert">{previewError} <button onClick={() => setRetry((v) => v + 1)}>Retry preview</button></div>}
        {(preview?.errors?.length || preview?.unresolved?.length) ? <div className="cr-error" role="alert">{preview.errors?.join(" ") || `Unresolved personalization: ${preview.unresolved?.join(", ")}`}</div> : null}
        <footer className="cr-savebar">
            <div className="cr-save-info"><span>{words} words</span><span>{dirty ? "Changes apply to this lead only" : "Reviewing does not send an email"}</span></div>
            <div className="cr-actions">{customized && <Button variant="ghost" size="sm" className="cr-reset" disabled={busy || !editable} onClick={() => void restoreShared()}><RotateCcw />Use original</Button>}<Button variant="outline" size="sm" className="cr-save" disabled={!canSave || !dirty} onClick={() => void save(false)}>{busy ? <Loader2 className="animate-spin" /> : <Save />}Save changes</Button><Button size="sm" className="cr-review" disabled={!canSave} onClick={() => void save(true)}><Check />Review & next<ArrowRight /></Button></div>
        </footer>
    </div>;
}
