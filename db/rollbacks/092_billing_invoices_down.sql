-- Reverts 092 only while no invoice or rectifying invoice exists. Once a
-- document is recorded it is fiscal evidence (an invoice request for a paid
-- order, or an issued invoice): switch BILLING_INVOICING_PROVIDER off and
-- repair forward instead.
BEGIN;
DO $$ BEGIN
  IF to_regclass('billing.invoice') IS NOT NULL AND (
       EXISTS (SELECT 1 FROM billing.invoice)
    OR EXISTS (SELECT 1 FROM billing.credit_note)
    OR EXISTS (SELECT 1 FROM billing.top_up_order WHERE invoice_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'billing invoices rollback refused: invoice documents exist; repair forward';
  END IF;
END $$;

DROP TRIGGER IF EXISTS top_up_order_invoicing ON billing.top_up_order;
ALTER TABLE billing.top_up_order DROP CONSTRAINT IF EXISTS top_up_order_invoice_fk;

DROP FUNCTION IF EXISTS
  billing.accountant_export(date, boolean),
  billing.invoice_documents_admin(text, boolean, integer),
  billing.void_invoice_document(uuid, text, uuid, text, text),
  billing.issue_invoice_document(uuid, text, uuid, text, date, text, text, text, text, text, integer, text, text, text),
  billing.record_invoicing_failure(uuid, text, uuid, text, text),
  billing.record_invoicing_handover(uuid, text, uuid, text, text, text),
  billing.claim_invoicing(uuid, text, uuid),
  billing.invoicing_due(integer),
  billing._document(uuid, text, uuid, boolean),
  billing._document_table(text),
  billing._invoicing_on_order(),
  billing._queue_credit_note(billing.top_up_order),
  billing._queue_invoice(billing.top_up_order),
  billing._invoice_lines(billing.top_up_order, integer);

DROP VIEW IF EXISTS billing.invoice_document;
DROP TABLE IF EXISTS billing.credit_note;
DROP TABLE IF EXISTS billing.invoice;
DROP TABLE IF EXISTS billing.invoice_series;
DROP FUNCTION IF EXISTS billing.tax_mention(text);
COMMIT;
