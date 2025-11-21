import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { BillingOverview } from "@/components/dashboard/billing-overview";
import { PaymentHistory } from "@/components/dashboard/payment-history";
export default async function BillingPage() {
  return (
    <>
      <DashboardHeader
        title="Billing"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Billing" },
        ]}
      />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Billing & Payments
          </h2>
          <p className="text-muted-foreground">
            Manage your payment methods and view transaction history
          </p>
        </div>
        <BillingOverview />
        <PaymentHistory />
      </div>
    </>
  );
}
