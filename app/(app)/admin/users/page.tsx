import { requireAdmin } from "@/lib/middleware/admin-check";
import { getAllUsers, updateUserRole } from "@/lib/actions/admin-actions";
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
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import Link from "next/link";
import { Users as UsersIcon } from "lucide-react";

export default async function AdminUsersPage() {
  await requireAdmin();
  const result = await getAllUsers();

  if ("error" in result) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 shadow-none">
        <CardContent className="py-6">
          <p className="font-semibold text-destructive">Unable to load users</p>
          <p className="text-sm text-slate-500">
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
    <div className="space-y-6 pb-10">
      <AdminPageHeader
        title="Users & Roles"
        description="Manage platform members, enforce role boundaries, and preserve least-privilege access."
        actions={
          <Button asChild variant="outline" className="shadow-none rounded-lg">
            <Link
              href="/admin/activity"
              data-dashboard-action="admin_users_open_activity"
            >
              Open audit log
            </Link>
          </Button>
        }
      />

      <Card className="border-slate-200 shadow-none bg-white overflow-hidden rounded-2xl py-0 gap-0">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50 border-b border-slate-200">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 pl-8">Name</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Email</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4">Role</TableHead>
                <TableHead className="font-semibold text-xs text-slate-500 uppercase tracking-wider py-4 text-right pr-8">Access Control</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-12 text-center text-sm text-slate-500"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <UsersIcon className="h-8 w-8 text-slate-300 mb-3" />
                      <p>No users found on the platform.</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {users.map((user) => (
                <TableRow key={user.id} className="group hover:bg-slate-50/50 transition-colors border-slate-200 bg-white">
                  <TableCell className="pl-8 py-4">
                    <span className="font-medium text-sm text-slate-900">
                      {user.full_name || "Unknown"}
                    </span>
                  </TableCell>
                  <TableCell className="py-4">
                    <span className="text-sm text-slate-500">
                      {user.mail || user.id}
                    </span>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge variant="secondary" className={`shadow-none font-medium text-[10px] uppercase tracking-wider ${user.role === 'admin' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : user.role === 'requester' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 pr-8 text-right">
                    <form
                      action={changeRole}
                      className="inline-flex items-center gap-2"
                    >
                      <input type="hidden" name="userId" value={user.id} />
                      <select
                        name="role"
                        defaultValue={user.role}
                        className="h-8 rounded-md border-slate-200 bg-slate-50 px-2 text-xs focus:ring-2 focus:ring-ring focus:outline-none"
                      >
                        <option value="contributor">contributor</option>
                        <option value="requester">requester</option>
                        <option value="admin">admin</option>
                      </select>
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="h-8 shadow-none rounded-md px-3 text-xs border-slate-200"
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
