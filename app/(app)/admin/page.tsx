import { OperatorConsole } from "@/components/admin/operator-console";
import { getOperatorConsoleOverview } from "@/lib/actions/operator-console-actions";
import {
  isOperatorModuleKey,
  type OperatorModuleKey,
} from "@/lib/operator/console-snapshot";
import { getServerTranslator } from "@/lib/i18n/server";
import { requireAdmin } from "@/lib/middleware/admin-check";

type AdminDashboardProps = {
  searchParams: Promise<{ module?: string | string[] }>;
};

function resolveActiveModuleKey(value: string | string[] | undefined): OperatorModuleKey {
  const moduleKey = Array.isArray(value) ? value[0] : value;
  return isOperatorModuleKey(moduleKey) ? moduleKey : "pipeline";
}

export default async function AdminDashboard({
  searchParams,
}: AdminDashboardProps) {
  await requireAdmin();
  const params = await searchParams;
  const t = await getServerTranslator();
  const overview = await getOperatorConsoleOverview();
  const activeModuleKey = resolveActiveModuleKey(params.module);

  return (
    <OperatorConsole
      activeModuleKey={activeModuleKey}
      snapshot={overview.data}
      t={t}
    />
  );
}
