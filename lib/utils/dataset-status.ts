import type { DatasetStatus } from "@/types/dataset";
import type { Database } from "@/types/database";

type DatasetRow = Database["public"]["Tables"]["dataset_requests"]["Row"];

export const deriveDatasetStatus = (
  approvalStatus: DatasetRow["approval_status"] | null,
  paymentStatus: DatasetRow["payment_status"] | null
): DatasetStatus => {
  if (approvalStatus !== "approved") return "paused";
  if (paymentStatus === "paid" || paymentStatus === "partial") return "active";
  return "paused";
};
