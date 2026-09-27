import { redirect } from "next/navigation";

/** Report publication state is part of the operator overview work table. */
export default function OpsReportsPage() {
  redirect("/ops?filter=all");
}
