import { getDatasets } from "@/lib/actions/dataset-actions";
import { getUserSubmissions } from "@/lib/actions/submission-actions";
import { PwaUploadClient } from "@/components/pwa/pwa-upload-client";

export default async function PwaUploadPage() {
  const [datasets, submissions] = await Promise.all([
    getDatasets(),
    getUserSubmissions(),
  ]);

  return (
    <div className="space-y-4 pb-16">
      <PwaUploadClient datasets={datasets} submissions={submissions} />
    </div>
  );
}
