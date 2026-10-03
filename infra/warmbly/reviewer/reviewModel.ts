import type Contact from "@/lib/api/models/app/contacts/Contact";
import type Sequence from "@/lib/api/models/app/campaigns/sequences/Sequence";
import type Inbox from "@/lib/api/models/app/emails/Inbox";

export function reviewKeys(stepId: string) {
    if (!/^[a-f\d-]{36}$/i.test(stepId)) throw new Error("Invalid email step.");
    const id = stepId.replaceAll("-", "");
    return { body: `CaudalsBody${id}`, subject: `CS${BigInt(`0x${id}`).toString(36)}`, reviewed: `CaudalsReviewed${id}` };
}

export function wrapCopy(copy: string, key: string): string {
    const prefix = key.startsWith("CS") ? `{{with .${key}}}{{.}}{{else}}` : `{{if .${key}}}{{.${key}}}{{else}}`;
    return copy.startsWith(prefix) ? copy : `${prefix}${copy}{{end}}`;
}

export function sharedCopy(copy: string, key: string): string {
    const prefix = key.startsWith("CS") ? `{{with .${key}}}{{.}}{{else}}` : `{{if .${key}}}{{.${key}}}{{else}}`;
    return copy.startsWith(prefix) && copy.endsWith("{{end}}") ? copy.slice(prefix.length, -7) : copy;
}

export function subjectTemplate(steps: Sequence[], index: number): string {
    const current = steps[index];
    if (!current?.thread_reply || index === 0) return current?.subject ?? "";
    for (let i = index - 1; i >= 0; i--) {
        if (!steps[i].thread_reply || i === 0) return steps[i].subject;
    }
    return "";
}

export function editingPatch(step: Sequence, body: string, subject: string): Record<string, string> {
    const keys = reviewKeys(step.id);
    return { [keys.body]: body.replaceAll("\r\n", "\n"), ...(!step.thread_reply ? { [keys.subject]: subject.trim() } : {}), [keys.reviewed]: "" };
}

export async function reviewVersion(contact: Contact, steps: Sequence[], index: number, sender: Inbox, settings = ""): Promise<string> {
    const step = steps[index];
    const subject = subjectTemplate(steps, index);
    const keys = [...new Set(Array.from((step.body_plain + subject).matchAll(/\.(\w+)/g), (m) => m[1]))].sort();
    const input = JSON.stringify({ step: step.id, body: step.body_plain, subject, settings, identity: [contact.first_name, contact.last_name, contact.email, contact.company, contact.phone], fields: keys.map((k) => [k, contact.custom_fields?.[k] ?? ""]), sender: [sender.id, sender.name, sender.email, sender.send_as_email, sender.signature_plain, sender.signature_html] });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function savedReview(fields: Record<string, string>, stepId: string): { version: string; at: string } | null {
    try {
        const value: unknown = JSON.parse(fields[reviewKeys(stepId).reviewed] || "null");
        if (value && typeof value === "object" && "version" in value && "at" in value && typeof value.version === "string" && typeof value.at === "string") return { version: value.version, at: value.at };
    } catch { /* Old or incomplete review markers are not approvals. */ }
    return null;
}

export function sameRevision(left: Contact, right: Contact): boolean {
    return JSON.stringify([left.first_name, left.last_name, left.email, left.company, left.phone, Object.entries(left.custom_fields ?? {}).sort()]) === JSON.stringify([right.first_name, right.last_name, right.email, right.company, right.phone, Object.entries(right.custom_fields ?? {}).sort()]);
}

export function stepRevision(step: Sequence): string {
    return JSON.stringify([step.subject, step.body_plain, step.body_html, step.body_sync, step.body_code, step.thread_reply, step.kind, step.conditions]);
}
