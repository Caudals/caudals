"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud } from "lucide-react";

import { Dataset, DataType } from "@/types/dataset";
import { useAuth } from "@/lib/auth/provider";
import { uploadMultipleFilesClient } from "@/lib/storage/client-upload";
import { createSubmission } from "@/lib/actions/submission-actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/ui/file-upload";
import { Badge } from "@/components/ui/badge";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

interface SubmissionWithDataset {
  id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  notes?: string | null;
  dataset_request_id: string;
  dataset_requests?: {
    id: string;
    title: string;
    reward_amount: number;
    currency: string;
  };
}

interface PwaUploadClientProps {
  datasets: Dataset[];
  submissions: SubmissionWithDataset[];
}

const STATUS_DISPLAY: Record<
  SubmissionWithDataset["status"],
  { label: string; className: string }
> = {
  pending: {
    label: "Pending review",
    className: "border-amber-200/70 bg-amber-400/20 text-amber-100",
  },
  approved: {
    label: "Approved",
    className: "border-emerald-200/70 bg-emerald-500/15 text-emerald-50",
  },
  rejected: {
    label: "Needs edits",
    className: "border-rose-200/70 bg-rose-500/15 text-rose-50",
  },
};

const ACCEPTED_FORMATS: Record<DataType, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  text: ".txt,.doc,.docx,.pdf",
  mixed: "*",
};

export function PwaUploadClient({ datasets, submissions }: PwaUploadClientProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();
  const [datasetId, setDatasetId] = useState<string>(datasets[0]?.id || "");
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === datasetId),
    [datasetId, datasets]
  );

  const acceptedFormats =
    selectedDataset?.dataType && ACCEPTED_FORMATS[selectedDataset.dataType]
      ? ACCEPTED_FORMATS[selectedDataset.dataType]
      : "*";

  const hasDatasets = datasets.length > 0;

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Sign in to upload contributions.");
      return;
    }

    if (!selectedDataset) {
      toast.error("Please select a dataset brief to contribute to.");
      return;
    }

    if (files.length === 0) {
      toast.error("Select at least one file to upload.");
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);

    try {
      const { urls, errors } = await uploadMultipleFilesClient(
        files,
        "dataset-files",
        selectedDataset.id,
        setUploadProgress
      );

      if (errors.length > 0) {
        toast.error(
          t("Failed to upload {{count}} file(s)", { count: errors.length }),
        );
        setIsSubmitting(false);
        return;
      }

      const result = await createSubmission({
        datasetRequestId: selectedDataset.id,
        fileUrls: urls,
        metadata: {
          fileCount: files.length,
          totalSize: files.reduce((sum, file) => sum + file.size, 0),
        },
        notes,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Upload submitted. Await reviewer approval.");
        setFiles([]);
        setNotes("");
        setUploadProgress(0);
        router.refresh();
      }
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong while submitting.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 p-6 text-white/70">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading your workspace...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-white">
        <UploadCloud className="mx-auto mb-3 h-10 w-10 text-white/70" />
        <h2 className="text-xl font-semibold">Sign in to contribute</h2>
        <p className="mt-2 text-sm text-white/70">
          Log in to link uploads to your contributor account and unlock rewards.
        </p>
        <Button asChild className="mt-4 rounded-2xl bg-white text-slate-900">
          <Link href="/auth/sign-in">Open sign-in</Link>
        </Button>
      </div>
    );
  }

  if (!hasDatasets) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center text-white/80">
        No dataset briefs are open for contributions right now. Check back soon!
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5 text-white shadow-[0_12px_30px_rgba(8,15,40,0.45)]">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Upload</p>
          <h2 className="text-2xl font-semibold">Submit a new contribution</h2>
          <p className="text-sm text-white/70">
            Pick a brief, attach your files, and leave any helpful reviewer notes.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.3em] text-white/50">
            Dataset brief
          </Label>
          <Select value={datasetId} onValueChange={setDatasetId}>
            <SelectTrigger className="rounded-2xl border border-white/20 bg-black/20 text-white">
              <SelectValue placeholder="Select a brief" />
            </SelectTrigger>
            <SelectContent className="border border-white/15 bg-slate-950 text-white">
              {datasets.map((dataset) => (
                <SelectItem key={dataset.id} value={dataset.id}>
                  {dataset.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedDataset && (
            <p className="text-xs text-white/60">
              Reward: {selectedDataset.currency} {selectedDataset.rewardAmount.toFixed(2)} •{" "}
              {selectedDataset.samplesCollected}/{selectedDataset.samplesNeeded} samples
              verified
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.3em] text-white/50">
            Files
          </Label>
          <FileUpload
            accept={acceptedFormats}
            multiple
            maxSize={50}
            onFilesSelected={setFiles}
            className="text-white"
          />
          {isSubmitting && (
            <div className="space-y-1 text-xs text-white/70">
              <p>Uploading... {Math.round(uploadProgress)}%</p>
              <div className="h-2 w-full rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-[0.3em] text-white/50">Notes</Label>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add helpful context for reviewers..."
            className="min-h-[120px] rounded-2xl border border-white/10 bg-black/20 text-white"
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full rounded-2xl bg-white text-slate-900"
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? "Submitting..." : "Submit upload"}
        </Button>
      </section>

      <section className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              History
            </p>
            <h3 className="text-lg font-semibold">Recent uploads</h3>
          </div>
          <Badge className="rounded-xl border-white/20 bg-white/10 text-xs text-white">
            {submissions.length} total
          </Badge>
        </div>
        {submissions.length === 0 ? (
          <p className="text-sm text-white/70">
            Your approved and pending submissions will appear here once you start
            contributing.
          </p>
        ) : (
          <div className="space-y-3">
            {submissions.map((submission) => {
              const dataset = submission.dataset_requests;
              const rewardAmount = dataset?.reward_amount ?? 0;
              const currency = dataset?.currency ?? "USD";

              return (
                <article
                  key={submission.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {dataset?.title ?? "Dataset brief"}
                      </p>
                      <p className="text-xs text-white/60">
                        {currency} {rewardAmount.toFixed(2)} •{" "}
                        {new Date(submission.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge className={STATUS_DISPLAY[submission.status].className}>
                      {STATUS_DISPLAY[submission.status].label}
                    </Badge>
                  </div>

                  {submission.notes && (
                    <p className="mt-2 rounded-2xl border border-white/10 bg-white/5 p-2 text-sm text-white/80">
                      {submission.notes}
                    </p>
                  )}

                  <div className="mt-3 flex gap-2">
                    {dataset?.id && (
                      <Link
                        href={`/pwa/datasets/${dataset.id}`}
                        className="flex-1 rounded-2xl border border-white/15 px-4 py-2 text-center text-sm text-white hover:bg-white/10"
                      >
                        View brief
                      </Link>
                    )}
                    <Link
                      href="/pwa"
                      className="flex-1 rounded-2xl border border-white/15 px-4 py-2 text-center text-sm text-white hover:bg-white/10"
                    >
                      Browse more
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
