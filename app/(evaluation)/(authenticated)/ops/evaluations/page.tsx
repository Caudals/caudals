import { redirect } from "next/navigation";

/** Evaluations across clients live in the operator overview work table. */
export default function OpsEvaluationsPage() {
  redirect("/ops");
}
