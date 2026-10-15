/** The ops billing console's sub-views (L-16), shared by the server page and the client console. */
import type { MessageKey } from "@/lib/evals/messages/en";

export type BillingView = "accounts" | "approvals" | "price-book" | "reconciliation" | "invoices" | "export" | "fraud" | "tax-review" | "overrides";
export const BILLING_VIEWS: ReadonlyArray<{ id: BillingView; label: MessageKey }> = [
  { id: "accounts", label: "billingOpsAccounts" }, { id: "approvals", label: "billingOpsApprovals" }, { id: "price-book", label: "billingOpsPriceBook" },
  { id: "reconciliation", label: "billingOpsReconciliation" }, { id: "invoices", label: "billingOpsInvoices" }, { id: "export", label: "billingOpsExport" },
  { id: "fraud", label: "billingOpsFraud" }, { id: "tax-review", label: "billingOpsTaxReviews" }, { id: "overrides", label: "billingOpsOverrides" },
];
export const isBillingView = (value: string | null | undefined): value is BillingView => BILLING_VIEWS.some(item => item.id === value);
