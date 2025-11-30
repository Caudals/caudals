import { requireAdmin } from "@/lib/middleware/admin-check";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminSettingsPage() {
    await requireAdmin();

    return (
        <>
            <DashboardHeader
                title="Platform Settings"
                description="Configure global platform settings and preferences."
            />
            <div className="flex flex-col gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>General Settings</CardTitle>
                        <CardDescription>
                            Manage platform-wide configurations.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Platform settings interface will be implemented here.</p>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
