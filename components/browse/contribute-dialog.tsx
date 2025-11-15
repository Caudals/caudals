"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/ui/file-upload";
import { createSubmission } from "@/lib/actions/submission-actions";
import { uploadMultipleFilesClient } from "@/lib/storage/client-upload";
import { Loader2 } from "lucide-react";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

interface ContributeDialogProps {
  datasetId: string;
  datasetTitle: string;
  dataType: string;
  children: React.ReactNode;
}

export function ContributeDialog({
  datasetId,
  datasetTitle,
  dataType,
  children,
}: ContributeDialogProps) {
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const getAcceptedFormats = () => {
    switch (dataType) {
      case "image":
        return "image/*";
      case "video":
        return "video/*";
      case "audio":
        return "audio/*";
      case "text":
        return ".txt,.doc,.docx,.pdf";
      default:
        return "*";
    }
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast.error("Please select at least one file");
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload files to storage
      const { urls, errors } = await uploadMultipleFilesClient(
        files,
        "dataset-files"
      );

      if (errors.length > 0) {
        toast.error(
          t("Failed to upload {{count}} file(s)", { count: errors.length }),
        );
        setIsSubmitting(false);
        return;
      }

      // Create submission record
      const result = await createSubmission({
        datasetRequestId: datasetId,
        fileUrls: urls,
        metadata: {
          fileCount: files.length,
          totalSize: files.reduce((sum, f) => sum + f.size, 0),
        },
        notes,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          "Contribution submitted successfully! Pending admin approval."
        );
        setOpen(false);
        setFiles([]);
        setNotes("");
        setUploadProgress(0);
        router.refresh();
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Contribute to {datasetTitle}</DialogTitle>
          <DialogDescription>
            Upload your data contribution. Your submission will be reviewed
            before approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Upload Files</Label>
            <FileUpload
              accept={getAcceptedFormats()}
              multiple={true}
              maxSize={50}
              onFilesSelected={setFiles}
            />
            {isSubmitting && uploadProgress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any additional information about your submission..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? "Submitting..." : "Submit Contribution"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
