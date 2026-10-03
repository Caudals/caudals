import { describe, expect, it } from "vitest";
import type Contact from "@/lib/api/models/app/contacts/Contact";
import type Sequence from "@/lib/api/models/app/campaigns/sequences/Sequence";
import type Inbox from "@/lib/api/models/app/emails/Inbox";
import { editingPatch, reviewKeys, reviewVersion, savedReview, sharedCopy, sameRevision, subjectTemplate, wrapCopy } from "./reviewModel";

const id = "aa76b4b9-8020-4d3d-a174-07c3119835d3";
const followup = "735c6c0b-f632-4910-8782-0cdbb145b42c";
const step = { id, kind: "email", subject: "Pilot for {{.Company}}", body_plain: "{{.Greeting}}\n\n{{.Hook}}", body_html: "", thread_reply: false } as Sequence;
const next = { ...step, id: followup, subject: "", thread_reply: true };
const contact: Contact = { id: "lead", first_name: "Mario", last_name: "Medrano", email: "mario@example.com", company: "Example", phone: "", custom_fields: { Greeting: "Hello Mario,", Hook: "A real hook.", SourceURL: "https://example.com/" }, subscribed: true, campaigns: [], categories: [], created_at: new Date(0), updated_at: new Date(0) };
const sender = { id: "sender", name: "Mario", email: "mario@caudals.com", signature_plain: "Mario\nCaudals", signature_html: "", send_as_email: "" } as Inbox;

describe("lead email reviewer", () => {
    it("keeps the full subject step identity within Warmbly's template limit", () => {
        const key = reviewKeys(id).subject;
        expect(BigInt(`0x${id.replaceAll("-", "")}`).toString(36)).toBe(key.slice(2));
        const original = "Piloto de evaluación para {{.Company}}";
        const wrapped = wrapCopy(original, key);
        expect(new TextEncoder().encode(wrapped).length).toBeLessThanOrEqual(100);
        expect(sharedCopy(wrapped, key)).toBe(original);
        expect(wrapCopy(wrapped, key)).toBe(wrapped);
    });
    it("keeps all paragraph breaks and writes only the selected email's fields", () => {
        const body = "Hello Mario,\n\nFirst paragraph.\n\nSecond paragraph.\n\nThanks,";
        const patch = editingPatch(step, body, " Pilot ");
        expect(patch[reviewKeys(id).body]).toBe(body);
        expect(patch[reviewKeys(id).subject]).toBe("Pilot");
        expect(Object.keys(patch)).toHaveLength(3);
        expect(patch).not.toHaveProperty("Greeting");
        expect(patch).not.toHaveProperty(reviewKeys(followup).body);
    });
    it("leaves the original template as a fallback and does not wrap twice", () => {
        const original = '{{.Greeting}}\n\n{{if .Hook}}{{.Hook}}{{else}}Fallback{{end}}';
        const key = reviewKeys(id).body;
        const wrapped = wrapCopy(original, key);
        expect(sharedCopy(wrapped, key)).toBe(original);
        expect(wrapCopy(wrapped, key)).toBe(wrapped);
    });
    it("inherits a follow-up's subject and never gives it a separate override", () => {
        expect(subjectTemplate([step, next], 1)).toBe(step.subject);
        expect(editingPatch(next, "Reply\n\nThanks", "Ignored")).not.toHaveProperty(reviewKeys(followup).subject);
    });
    it("does not overwrite concurrent contact edits or depend on field order", () => {
        expect(sameRevision(contact, { ...contact, custom_fields: { SourceURL: "https://example.com/", Hook: "A real hook.", Greeting: "Hello Mario," } })).toBe(true);
        expect(sameRevision(contact, { ...contact, custom_fields: { ...contact.custom_fields, Hook: "Another editor's change." } })).toBe(false);
    });
    it("invalidates review when relevant copy, recipient or signature changes", async () => {
        const version = await reviewVersion(contact, [step, next], 0, sender);
        expect(await reviewVersion({ ...contact, custom_fields: { ...contact.custom_fields, Hook: "Changed." } }, [step, next], 0, sender)).not.toBe(version);
        expect(await reviewVersion({ ...contact, email: "other@example.com" }, [step, next], 0, sender)).not.toBe(version);
        expect(await reviewVersion(contact, [step, next], 0, { ...sender, signature_plain: "Another signature" })).not.toBe(version);
        expect(await reviewVersion(contact, [step, next], 0, sender, "different sending settings")).not.toBe(version);
    });
    it("reviewing another email cannot invalidate an earlier review", async () => {
        const wrapped = { ...step, body_plain: wrapCopy(step.body_plain, reviewKeys(id).body) };
        const version = await reviewVersion(contact, [wrapped, next], 0, sender);
        const another = { ...contact, custom_fields: { ...contact.custom_fields, [reviewKeys(followup).body]: "Changed follow-up", [reviewKeys(followup).reviewed]: "review marker" } };
        expect(await reviewVersion(another, [wrapped, next], 0, sender)).toBe(version);
        expect(await reviewVersion({ ...another, custom_fields: { ...another.custom_fields, [reviewKeys(id).body]: "This email changed" } }, [wrapped, next], 0, sender)).not.toBe(version);
    });
    it("a changed opening subject invalidates the follow-up review", async () => {
        const wrapped = { ...step, subject: wrapCopy(step.subject, reviewKeys(id).subject) };
        const version = await reviewVersion(contact, [wrapped, next], 1, sender);
        const changed = { ...contact, custom_fields: { ...contact.custom_fields, [reviewKeys(id).subject]: "New subject" } };
        expect(await reviewVersion(changed, [wrapped, next], 1, sender)).not.toBe(version);
    });
    it("malformed approval metadata is never treated as reviewed", () => {
        expect(savedReview({ [reviewKeys(id).reviewed]: '{"version":true,"at":1}' }, id)).toBeNull();
        expect(savedReview({ [reviewKeys(id).reviewed]: "broken" }, id)).toBeNull();
        expect(() => reviewKeys('{{.Bad}}')).toThrow();
    });
});
