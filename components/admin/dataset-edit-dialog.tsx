"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import {
  categoryLabels,
  dataTypeLabels,
  statusLabels,
} from "@/lib/data/datasets";
import { adminUpdateDatasetRequest } from "@/lib/actions/admin-actions";
import { AdminDatasetRequest } from "@/types/admin";
import {
  DatasetCategory,
  DataType,
  DatasetStatus,
} from "@/types/dataset";
import { FileUpload } from "@/components/ui/file-upload";
import {
  deleteFileClient,
  uploadFileClient,
} from "@/lib/storage/client-upload";

interface DatasetEditDialogProps {
  open: boolean;
  dataset: AdminDatasetRequest | null;
  onOpenChange: (open: boolean) => void;
}

interface FormState {
  title: string;
  description: string;
  category: DatasetCategory | "";
  dataType: DataType | "";
  status: DatasetStatus | "";
  samplesNeeded: string;
  samplesCollected: string;
  rewardAmount: string;
  currency: string;
  deadline: string;
  qualityCriteria: string;
  requirements: string;
  imageUrl: string;
  featured: boolean;
}

const DATASET_IMAGE_BUCKET = "dataset-images";
const DATASET_IMAGE_FOLDER = "covers";

const defaultState: FormState = {
  title: "",
  description: "",
  category: "",
  dataType: "",
  status: "",
  samplesNeeded: "",
  samplesCollected: "",
  rewardAmount: "",
  currency: "USD",
  deadline: "",
  qualityCriteria: "",
  requirements: "",
  imageUrl: "",
  featured: false,
};

export function DatasetEditDialog({
  open,
  dataset,
  onOpenChange,
}: DatasetEditDialogProps) {
  const router = useRouter();
  const [formState, setFormState] = useState<FormState>(defaultState);
  const [isSaving, startTransition] = useTransition();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [fileUploadKey, setFileUploadKey] = useState(0);
  const [uploadedImagePath, setUploadedImagePath] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (dataset && open) {
      setFormState({
        title: dataset.title || "",
        description: dataset.description || "",
        category: dataset.category || "",
        dataType: dataset.data_type || "",
        status: dataset.status || "",
        samplesNeeded: dataset.samples_needed?.toString() || "",
        samplesCollected: dataset.samples_collected?.toString() || "",
        rewardAmount: dataset.reward_amount?.toString() || "",
        currency: dataset.currency || "USD",
        deadline: dataset.deadline
          ? dataset.deadline.slice(0, 10)
          : "",
        qualityCriteria: (dataset.quality_criteria || []).join("\n"),
        requirements: (dataset.requirements || []).join("\n"),
        imageUrl: dataset.image_url || "",
        featured: dataset.featured ?? false,
      });
      setImageUploadError(null);
      setUploadedImagePath(null);
      setIsUploadingImage(false);
      setFileUploadKey((key) => key + 1);
    } else if (!open) {
      setFormState(defaultState);
      setImageUploadError(null);
      setIsUploadingImage(false);
      setFileUploadKey((key) => key + 1);
    }
  }, [dataset, open]);

  useEffect(() => {
    if (!open && uploadedImagePath) {
      const pathToDelete = uploadedImagePath;
      setUploadedImagePath(null);
      void deleteFileClient(DATASET_IMAGE_BUCKET, pathToDelete);
    }
  }, [open, uploadedImagePath]);

  const updateField = (field: keyof FormState, value: string | boolean) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCoverImageChange = async (files: File[]) => {
    if (files.length === 0) {
      if (uploadedImagePath) {
        await deleteFileClient(DATASET_IMAGE_BUCKET, uploadedImagePath);
        setUploadedImagePath(null);
      }
      setFormState((prev) => ({ ...prev, imageUrl: "" }));
      setImageUploadError(null);
      setFileUploadKey((key) => key + 1);
      return;
    }

    const file = files[0];

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload a valid image file.");
      setFileUploadKey((key) => key + 1);
      return;
    }

    const maxFileSizeBytes = 8 * 1024 * 1024;
    if (file.size > maxFileSizeBytes) {
      toast.error("Image is too large. Please upload a file under 8MB.");
      setFileUploadKey((key) => key + 1);
      return;
    }

    setIsUploadingImage(true);
    setImageUploadError(null);

    try {
      if (uploadedImagePath) {
        await deleteFileClient(DATASET_IMAGE_BUCKET, uploadedImagePath);
        setUploadedImagePath(null);
      }

      const targetFolder = dataset?.id || DATASET_IMAGE_FOLDER;
      const { url, path, error } = await uploadFileClient(
        file,
        DATASET_IMAGE_BUCKET,
        targetFolder
      );

      if (error || !url || !path) {
        const message = error || "Unable to upload image. Please try again.";
        setImageUploadError(message);
        toast.error(message);
        setFileUploadKey((key) => key + 1);
        return;
      }

      setFormState((prev) => ({
        ...prev,
        imageUrl: url,
      }));
      setUploadedImagePath(path);
      toast.success("Cover image updated");
    } catch (error) {
      console.error("Error uploading cover image", error);
      const message = "An unexpected error occurred while uploading.";
      setImageUploadError(message);
      toast.error(message);
      setFileUploadKey((key) => key + 1);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleRemoveImage = async () => {
    if (uploadedImagePath) {
      await deleteFileClient(DATASET_IMAGE_BUCKET, uploadedImagePath);
      setUploadedImagePath(null);
    }
    setFormState((prev) => ({ ...prev, imageUrl: "" }));
    setImageUploadError(null);
    setFileUploadKey((key) => key + 1);
    toast.success("Image removed. Save changes to update the dataset.");
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dataset) return;

    startTransition(async () => {
      const qualityCriteria = formState.qualityCriteria
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);

      const requirements = formState.requirements
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);

      const trimmedCurrency = formState.currency.trim();
      const trimmedDeadline = formState.deadline.trim();
      const trimmedImageUrl = formState.imageUrl.trim();

      const payload = {
        title: formState.title.trim(),
        description: formState.description.trim(),
        category: formState.category || undefined,
        data_type: formState.dataType || undefined,
        status: formState.status || undefined,
        samples_needed: formState.samplesNeeded
          ? Number(formState.samplesNeeded)
          : undefined,
        samples_collected: formState.samplesCollected
          ? Number(formState.samplesCollected)
          : undefined,
        reward_amount: formState.rewardAmount
          ? Number(formState.rewardAmount)
          : undefined,
        currency: trimmedCurrency || undefined,
        deadline: trimmedDeadline || undefined,
        quality_criteria: qualityCriteria,
        requirements,
        image_url: trimmedImageUrl ? trimmedImageUrl : null,
        featured: formState.featured,
      };

      const result = await adminUpdateDatasetRequest(dataset.id, payload);

      if ("error" in result) {
        toast.error(result.error || "Unable to update dataset");
        return;
      }

      toast.success("Dataset updated successfully");
      setUploadedImagePath(null);
      router.refresh();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit Dataset</DialogTitle>
          <DialogDescription>
            Update dataset information and save your changes.
          </DialogDescription>
        </DialogHeader>

        {dataset ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4 rounded-lg border border-border/70 bg-muted/10 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Label className="text-sm font-semibold">Cover image</Label>
                  <p className="text-xs text-muted-foreground">
                    Upload a new preview image for the dataset card and detail page.
                  </p>
                </div>
                {formState.imageUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void handleRemoveImage();
                    }}
                    disabled={isUploadingImage || isSaving}
                  >
                    Remove image
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-start">
                <div className="relative h-44 w-full overflow-hidden rounded-xl border bg-muted">
                  {formState.imageUrl ? (
                    <Image
                      src={formState.imageUrl}
                      alt={`Preview for ${formState.title || "dataset"}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 220px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      {isUploadingImage ? "Uploading image..." : "No image selected"}
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <FileUpload
                    key={fileUploadKey}
                    accept="image/*"
                    multiple={false}
                    maxSize={8}
                    onFilesSelected={(files) => {
                      void handleCoverImageChange(files);
                    }}
                  />
                  {imageUploadError && (
                    <p className="text-xs text-destructive">{imageUploadError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    • JPG, PNG, or WEBP up to 8MB. <br />
                    • Landscape images display best in browse cards. <br />
                    • Uploading a new file replaces the existing image.
                  </p>
                  {isUploadingImage && (
                    <p className="text-xs font-medium text-foreground">
                      Uploading... please wait.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="dataset-title">Title</Label>
                <Input
                  id="dataset-title"
                  value={formState.title}
                  onChange={(event) =>
                    updateField("title", event.target.value)
                  }
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="dataset-description">Description</Label>
                <Textarea
                  id="dataset-description"
                  value={formState.description}
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
                  rows={5}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={formState.category}
                  onValueChange={(value) =>
                    updateField("category", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(categoryLabels) as DatasetCategory[]).map(
                      (category) => (
                        <SelectItem key={category} value={category}>
                          {categoryLabels[category]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data Type</Label>
                <Select
                  value={formState.dataType}
                  onValueChange={(value) =>
                    updateField("dataType", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select data type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(dataTypeLabels) as DataType[]).map(
                      (type) => (
                        <SelectItem key={type} value={type}>
                          {dataTypeLabels[type]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formState.status}
                  onValueChange={(value) =>
                    updateField("status", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(statusLabels) as DatasetStatus[]).map(
                      (status) => (
                        <SelectItem key={status} value={status}>
                          {statusLabels[status]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataset-deadline">Deadline</Label>
                <Input
                  id="dataset-deadline"
                  type="date"
                  value={formState.deadline}
                  onChange={(event) =>
                    updateField("deadline", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataset-reward">Reward Amount</Label>
                <Input
                  id="dataset-reward"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.rewardAmount}
                  onChange={(event) =>
                    updateField("rewardAmount", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataset-currency">Currency</Label>
                <Input
                  id="dataset-currency"
                  value={formState.currency}
                  onChange={(event) =>
                    updateField("currency", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataset-samples-needed">Samples Needed</Label>
                <Input
                  id="dataset-samples-needed"
                  type="number"
                  min="0"
                  value={formState.samplesNeeded}
                  onChange={(event) =>
                    updateField("samplesNeeded", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataset-samples-collected">
                  Samples Collected
                </Label>
                <Input
                  id="dataset-samples-collected"
                  type="number"
                  min="0"
                  value={formState.samplesCollected}
                  onChange={(event) =>
                    updateField("samplesCollected", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="dataset-quality">Quality Criteria</Label>
                <Textarea
                  id="dataset-quality"
                  value={formState.qualityCriteria}
                  onChange={(event) =>
                    updateField("qualityCriteria", event.target.value)
                  }
                  rows={4}
                  placeholder="One item per line"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="dataset-requirements">Requirements</Label>
                <Textarea
                  id="dataset-requirements"
                  value={formState.requirements}
                  onChange={(event) =>
                    updateField("requirements", event.target.value)
                  }
                  rows={4}
                  placeholder="One item per line"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="dataset-image-url">Image URL</Label>
                <Input
                  id="dataset-image-url"
                  value={formState.imageUrl}
                  onChange={(event) =>
                    updateField("imageUrl", event.target.value)
                  }
                  placeholder="https://example.com/image.jpg"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                <div>
                  <Label htmlFor="dataset-featured" className="text-sm">
                    Feature this dataset
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Featured datasets receive prioritized placement.
                  </p>
                </div>
                <Switch
                  id="dataset-featured"
                  checked={formState.featured}
                  onCheckedChange={(value) =>
                    updateField("featured", value)
                  }
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || isUploadingImage}>
                {isSaving || isUploadingImage ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a dataset to edit.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
