import { requireAdmin } from "@/lib/middleware/admin-check";
import {
  adminUpdateDatasetRequest,
  getAdminDatasetRequests,
} from "@/lib/actions/admin-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import Link from "next/link";

export default async function AdminFeaturedPage() {
  await requireAdmin();
  const result = await getAdminDatasetRequests();

  if ("error" in result) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="py-6">
          <p className="font-semibold text-destructive">
            Unable to load datasets
          </p>
          <p className="text-sm text-muted-foreground">
            {result.error || "Please try again later."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const datasets = result.data ?? [];

  const toggleFeatured = async (formData: FormData) => {
    "use server";
    const id = formData.get("id") as string;
    const featured = formData.get("featured") === "true";
    await adminUpdateDatasetRequest(id, { featured });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Growth merchandising"
        title="Featured placements"
        description="Promote approved datasets across homepage and discovery surfaces."
        actions={
          <Button asChild variant="outline">
            <Link
              href="/admin/datasets"
              data-dashboard-action="admin_featured_open_datasets"
            >
              Back to dataset management
            </Link>
          </Button>
        }
      />

      <Card className="border-border shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dataset</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No datasets available.
                  </TableCell>
                </TableRow>
              )}
              {datasets.map((ds) => (
                <TableRow key={ds.id} >
                  <TableCell className="font-medium">
                    <div>{ds.title}</div>
                    <p className="text-xs text-muted-foreground">
                      {ds.category}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {ds.approval_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {ds.image_url ? (
                      <Image
                        src={ds.image_url}
                        alt={ds.title}
                        width={72}
                        height={48}
                        className="h-12 w-20 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <form
                      action={toggleFeatured}
                      className="inline-flex items-center gap-2"
                    >
                      <input type="hidden" name="id" value={ds.id} />
                      <input
                        type="hidden"
                        name="featured"
                        value={(!ds.featured).toString()}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant={ds.featured ? "outline" : "default"}
                        className="rounded-lg"
                      >
                        {ds.featured ? "Unfeature" : "Feature"}
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
