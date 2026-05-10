import { requireCurrentOperator } from "@/lib/auth/operator-session";

export async function requireAdmin() {
  return requireCurrentOperator();
}
