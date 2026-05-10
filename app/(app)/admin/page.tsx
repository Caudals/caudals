import { OperatorConsole } from "@/components/admin/operator-console";
import { getOperatorConsoleOverview } from "@/lib/actions/operator-console-actions";
import { getServerTranslator } from "@/lib/i18n/server";
import { requireAdmin } from "@/lib/middleware/admin-check";

export default async function AdminDashboard() {
  await requireAdmin();
  const t = await getServerTranslator();
  const overview = await getOperatorConsoleOverview();

  return <OperatorConsole snapshot={overview.data} t={t} />;
}
