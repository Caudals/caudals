import { requireAdmin } from "@/lib/middleware/admin-check";
import {
  adminUpdateDatasetRequest,
  getAdminDatasetRequests,
} from "@/lib/actions/admin-actions";
import { Card, CardContent } from "@/components/ui/card";
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
import { Image as ImageIcon, Star, StarOff } from "lucide-react";

export default async function AdminFeaturedPage() {
  await requireAdmin();
  const result = await getAdminDatasetRequests();

  if ("error" in result) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 shadow-none">
        <CardContent className="py-6">
          <p className="font-semibold text-destructive">
            Unable to load datasets
          </p>
          <p className="text-sm text-slate-500">
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
    <div className="space-y-6 pb-10">
      <AdminPageHeader
        title="Featured Placements"
        description="Promote approved datasets across the homepage and discovery surfaces to drive engagement."
        actions={
          <Button asChild variant="outline" className="shadow-none rounded-lg">
            <Link
              href="/admin/datasets"
              data-dashboard-action="admin_featured_open_datasets"
            >
              Back to Datasets
            </Link>
          </Button>
        }
      />

      <Card className="border-slate-200 shadow-none bg-white overflow-hidden rounded-2xl py-0 gap-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pl-8">Dataset</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Status</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Preview</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-8">Merchandising</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-12 text-center text-sm text-slate-500"
                  >
                    No datasets available.
                  </TableCell>
                </TableRow>
              )}
              {datasets.map((ds) => (
                <TableRow key={ds.id} className="group hover:bg-slate-50/50 transition-colors border-slate-200 bg-white">
                  <TableCell className="pl-8 py-4">
                    <div className="font-medium text-slate-900 text-sm line-clamp-1 max-w-[300px]">{ds.title}</div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {ds.category}
                    </p>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge variant={ds.approval_status === "approved" ? "default" : "secondary"} className={`shadow-none text-[10px] uppercase tracking-wider font-semibold ${ds.approval_status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      {ds.approval_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4">
                    {ds.image_url ? (
                      <div className="relative h-12 w-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                        <Image
                          src={ds.image_url}
                          alt={ds.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-12 w-20 rounded-lg border border-dashed border-slate-200 flex items-center justify-center bg-slate-50">
                        <ImageIcon className="h-4 w-4 text-slate-300" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right py-4 pr-8">
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
                        variant={ds.featured ? "secondary" : "outline"}
                        className={`rounded-lg shadow-none ${ds.featured ? 'bg-[var(--accent)]/10 text-[var(--accent-foreground)] hover:bg-[var(--accent)]/20 border-transparent' : 'border-slate-200 text-slate-700 bg-white'}`}
                      >
                        {ds.featured ? (
                          <>
                            <Star className="h-3.5 w-3.5 mr-1.5 fill-[var(--accent)] text-[var(--accent)]" /> 
                            Featured
                          </>
                        ) : (
                          <>
                            <StarOff className="h-3.5 w-3.5 mr-1.5 text-slate-400" /> 
                            Feature
                          </>
                        )}
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
