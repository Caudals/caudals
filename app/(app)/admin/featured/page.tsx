import { requireAdmin } from "@/lib/middleware/admin-check";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminFeaturedPage() {
    await requireAdmin();

    return (
        <>
            <DashboardHeader
                title="Featured Ads Management"
                description="Manage featured content and advertisements on the platform."
            />
            <div className="flex flex-col gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Featured Content</CardTitle>
                        <CardDescription>
                            Promote datasets or other content to users.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Featured ads management interface will be implemented here.</p>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
