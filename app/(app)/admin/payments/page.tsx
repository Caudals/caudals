import { requireAdmin } from "@/lib/middleware/admin-check";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentAnalytics } from "@/components/admin/payment-analytics";

export default async function AdminPaymentsPage() {
    await requireAdmin();

    return (
        <>
            <DashboardHeader
                title="Payment Overview"
                description="Manage platform financial transactions and balances."
            />
            <div className="flex flex-col gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Financial Overview</CardTitle>
                        <CardDescription>
                            View recent transactions and platform revenue.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <PaymentAnalytics />
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
