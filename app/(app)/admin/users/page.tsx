import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAllUsers, updateUserRole } from "@/lib/actions/admin-actions";
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
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import Link from "next/link";

export default async function AdminUsersPage() {
  await requireAdmin();
  const result = await getAllUsers();

  if ("error" in result) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="py-6">
          <p className="font-semibold text-destructive">Unable to load users</p>
          <p className="text-sm text-muted-foreground">
            {result.error || "Please try again later."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const users = result.data ?? [];

  const changeRole = async (formData: FormData) => {
    "use server";
    const userId = formData.get("userId") as string;
    const role = formData.get("role") as "contributor" | "requester" | "admin";
    if (userId && role) {
      await updateUserRole(userId, role);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Identity and access"
        title="Users and roles"
        description="Manage platform members, enforce role boundaries, and preserve least-privilege access."
        actions={
          <Button asChild variant="outline">
            <Link
              href="/admin/activity"
              data-dashboard-action="admin_users_open_activity"
            >
              Open audit log
            </Link>
          </Button>
        }
      />

      <Card className="border-border shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No users found.
                  </TableCell>
                </TableRow>
              )}
              {users.map((user) => (
                <TableRow key={user.id} >
                  <TableCell className="font-medium">
                    {user.full_name || "Unknown"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.mail || user.id}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <form
                      action={changeRole}
                      className="inline-flex items-center gap-2"
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <select
                        name="role"
                        defaultValue={user.role}
                        className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
                      >
                        <option value="contributor">contributor</option>
                        <option value="requester">requester</option>
                        <option value="admin">admin</option>
                      </select>
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                      >
                        Save
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
