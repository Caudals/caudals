import type { Database } from "./database";

export type DatasetRequestRow =
  Database["public"]["Tables"]["dataset_requests"]["Row"];

export interface AdminDatasetRequest extends DatasetRequestRow {
  profiles?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}
