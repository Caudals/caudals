"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createDatasetRequest } from "@/lib/actions/dataset-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { DatasetCategory, DataType } from "@/types/dataset";
import {
  uploadFileClient,
  deleteFileClient,
} from "@/lib/storage/client-upload";
import { FileUpload } from "@/components/ui/file-upload";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";

const DATASET_IMAGE_BUCKET = "dataset-images";
const DATASET_IMAGE_FOLDER = "covers";

const steps = [
  {
    id: 1,
    title: "Basic Info",
    description: "Title and description",
  },
  {
    id: 2,
    title: "Requirements",
    description: "Data specifications",
  },
  {
    id: 3,
    title: "Compensation",
    description: "Reward and pricing",
  },
  {
    id: 4,
    title: "Review",
    description: "Review and publish",
  },
];

type NewRequestFormState = {
  title: string;
  description: string;
  category: DatasetCategory | "";
  dataType: DataType | "";
  sampleCount: string;
  qualityCriteria: string;
  requirements: string;
  rewardAmount: string;
  currency: string;
  timeline: string;
  imageUrl: string;
  imagePath: string;
};

export function NewRequestForm() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useLocaleToast();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(
    null
  );
  const [fileUploadKey, setFileUploadKey] = useState(0);
  const [formData, setFormData] = useState<NewRequestFormState>({
    title: "",
    description: "",
    category: "",
    dataType: "",
    sampleCount: "",
    qualityCriteria: "",
    requirements: "",
    rewardAmount: "",
    currency: "USD",
    timeline: "",
    imageUrl: "",
    imagePath: "",
  });

  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const nextStep = () => {
    if (currentStep === 1) {
      const hasBasicInfo =
        formData.title.trim().length > 0 &&
        formData.description.trim().length > 0 &&
        formData.category !== "" &&
        formData.dataType !== "" &&
        formData.imageUrl !== "";

      if (!hasBasicInfo) {
        toast.error(
          "Please complete the basic information and upload a cover image before continuing."
        );
        return;
      }
    }

    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCoverImageChange = async (files: File[]) => {
    if (files.length === 0) {
      if (formData.imagePath) {
        const { error: deleteError } = await deleteFileClient(
          DATASET_IMAGE_BUCKET,
          formData.imagePath
        );
        if (deleteError) {
          console.error("Error removing previous cover image", deleteError);
        }
      }
      setFormData((prev) => ({
        ...prev,
        imageUrl: "",
        imagePath: "",
      }));
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
      if (formData.imagePath) {
        const { error: deleteError } = await deleteFileClient(
          DATASET_IMAGE_BUCKET,
          formData.imagePath
        );
        if (deleteError) {
          console.error("Error removing previous cover image", deleteError);
        }
        setFormData((prev) => ({
          ...prev,
          imageUrl: "",
          imagePath: "",
        }));
      }

      const { url, path, error } = await uploadFileClient(
        file,
        DATASET_IMAGE_BUCKET,
        DATASET_IMAGE_FOLDER
      );

      if (error || !url || !path) {
        const message = error || "Unable to upload image. Please try again.";
        setImageUploadError(message);
        toast.error(message);
        setFileUploadKey((key) => key + 1);
        return;
      }

      setFormData((prev) => ({
        ...prev,
        imageUrl: url,
        imagePath: path,
      }));
      setImageUploadError(null);
      toast.success("Cover image uploaded");
    } catch (error) {
      console.error("Error uploading cover image", error);
      const message = "An unexpected error occurred while uploading.";
      setImageUploadError(message);
      toast.error(message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      if (!formData.imageUrl) {
        toast.error("Please upload a cover image before publishing.");
        return;
      }

      // Calculate deadline based on timeline
      const deadline = new Date();
      switch (formData.timeline) {
        case "1-week":
          deadline.setDate(deadline.getDate() + 7);
          break;
        case "2-weeks":
          deadline.setDate(deadline.getDate() + 14);
          break;
        case "1-month":
          deadline.setMonth(deadline.getMonth() + 1);
          break;
        case "flexible":
          deadline.setMonth(deadline.getMonth() + 3);
          break;
        default:
          deadline.setMonth(deadline.getMonth() + 1);
      }

      // Parse quality criteria and requirements (split by newline or comma)
      const qualityCriteria = formData.qualityCriteria
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const requirements = formData.requirements
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const result = await createDatasetRequest({
        title: formData.title,
        description: formData.description,
        category: formData.category as DatasetCategory,
        dataType: formData.dataType as DataType,
        samplesNeeded: Number(formData.sampleCount),
        qualityCriteria,
        requirements,
        rewardAmount: Number(formData.rewardAmount),
        currency: formData.currency,
        deadline: deadline.toISOString().split("T")[0],
        imageUrl: formData.imageUrl,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Dataset request submitted! Pending admin approval.");
        router.push("/dashboard/requests");
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
    <div className="space-y-8 pb-12">
      {/* Progress Steps */}
      <div className="relative">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="relative flex flex-1 flex-col items-center"
            >
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className={`absolute left-[calc(50%+20px)] top-6 h-[2px] w-[calc(100%-40px)] transition-all ${
                    currentStep > step.id ? "bg-emerald-500" : "bg-muted"
                  }`}
                />
              )}

              {/* Step Circle */}
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    currentStep > step.id
                      ? "bg-emerald-500 border-emerald-500 text-white shadow-md"
                      : currentStep === step.id
                      ? "bg-gray-100 border-gray-300 text-gray-700 shadow-md"
                      : "border-muted bg-background text-muted-foreground"
                  }`}
                >
                  {currentStep > step.id ? (
                    <Check className="h-6 w-6" />
                  ) : (
                    <span className="text-base font-semibold">{step.id}</span>
                  )}
                </div>

                {/* Step Info */}
                <div className="flex flex-col items-center gap-1">
                  <p
                    className={`text-sm font-semibold transition-colors ${
                      currentStep >= step.id
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="hidden text-xs text-muted-foreground sm:block">
                    {step.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator className="my-8" />

      {/* Step 1: Basic Info */}
      {currentStep === 1 && (
        <Card className="border-2 shadow-sm">
          <CardHeader className="space-y-2 pb-6">
            <CardTitle className="text-2xl">Basic Information</CardTitle>
            <CardDescription className="text-base">
              Provide a clear title and description for your dataset request
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Cover Image*</Label>
                {formData.imageUrl && (
                  <span className="text-xs text-muted-foreground">
                    Recommended 4:3 or square (min 800 x 600)
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                This image appears in the public browse feed and dataset details
                page. Choose something clear and representative of your request.
              </p>
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
              <div className="grid gap-3 sm:grid-cols-[220px_auto] sm:items-start">
                <div className="relative h-40 w-full overflow-hidden rounded-xl border bg-muted/40">
                  {formData.imageUrl ? (
                    <Image
                      src={formData.imageUrl}
                      alt={`Cover image preview for ${formData.title || "dataset request"}`}
                      fill
                      sizes="(max-width: 640px) 100vw, 220px"
                      className="object-cover"
                      priority
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      {isUploadingImage
                        ? "Uploading image..."
                        : "No image selected yet"}
                    </div>
                  )}
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    • JPG, PNG, or WEBP up to 8MB
                    <br />• Landscape and square images work best
                    <br />• You can replace or remove the image anytime before
                    publishing
                  </p>
                  {isUploadingImage && (
                    <p className="font-medium text-foreground">
                      Uploading... please wait
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title" className="text-base">
                Request Title*
              </Label>
              <Input
                id="title"
                placeholder="e.g., Street Scene Images for Autonomous Driving"
                value={formData.title}
                onChange={(e) => updateFormData("title", e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                A descriptive title that clearly explains what data you need
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-base">
                Description*
              </Label>
              <Textarea
                id="description"
                placeholder="Describe what kind of data you need, its purpose, and any specific requirements..."
                rows={5}
                value={formData.description}
                onChange={(e) => updateFormData("description", e.target.value)}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Explain the purpose and context of your dataset request
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category" className="text-base">
                  Category*
                </Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => updateFormData("category", value)}
                >
                  <SelectTrigger id="category" className="h-11">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="computer-vision">Computer Vision</SelectItem>
                    <SelectItem value="natural-language">Natural Language</SelectItem>
                    <SelectItem value="speech-audio">Speech & Audio</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="robotics">Robotics</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataType" className="text-base">
                  Data Type*
                </Label>
                <Select
                  value={formData.dataType}
                  onValueChange={(value) => updateFormData("dataType", value)}
                >
                  <SelectTrigger id="dataType" className="h-11">
                    <SelectValue placeholder="Select data type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="image">Images</SelectItem>
                    <SelectItem value="video">Videos</SelectItem>
                    <SelectItem value="audio">Audio</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Requirements */}
      {currentStep === 2 && (
        <Card className="border-2 shadow-sm">
          <CardHeader className="space-y-2 pb-6">
            <CardTitle className="text-2xl">Data Requirements</CardTitle>
            <CardDescription className="text-base">
              Define the specifications and quality criteria for submissions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="sampleCount" className="text-base">
                Target Sample Count*
              </Label>
              <Input
                id="sampleCount"
                type="number"
                placeholder="e.g., 1000"
                value={formData.sampleCount}
                onChange={(e) => updateFormData("sampleCount", e.target.value)}
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                How many samples do you need to collect?
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="qualityCriteria" className="text-base">
                Quality Criteria*
              </Label>
              <Textarea
                id="qualityCriteria"
                placeholder="Enter each criterion on a new line or separated by commas&#10;e.g., Minimum resolution: 1920x1080&#10;Clear, well-lit conditions&#10;No watermarks"
                rows={5}
                value={formData.qualityCriteria}
                onChange={(e) =>
                  updateFormData("qualityCriteria", e.target.value)
                }
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Specify what makes a submission acceptable (one per line)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="requirements" className="text-base">
                Contributor Requirements
              </Label>
              <Textarea
                id="requirements"
                placeholder="Enter each requirement on a new line or separated by commas&#10;e.g., Smartphone with 12MP+ camera&#10;Access to outdoor spaces"
                rows={4}
                value={formData.requirements}
                onChange={(e) => updateFormData("requirements", e.target.value)}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                What contributors need to participate (one per line)
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-base">Example Quality Standards</Label>
              <div className="grid gap-2 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>Minimum resolution: 1920x1080</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>Clear, well-lit conditions</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>No watermarks or text overlays</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>Original content only (no stock photos)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Compensation */}
      {currentStep === 3 && (
        <Card className="border-2 shadow-sm">
          <CardHeader className="space-y-2 pb-6">
            <CardTitle className="text-2xl">Compensation & Timeline</CardTitle>
            <CardDescription className="text-base">
              Set the reward amount and expected timeline for completion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rewardAmount" className="text-base">
                  Reward per Submission*
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => updateFormData("currency", value)}
                  >
                    <SelectTrigger className="h-11 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    id="rewardAmount"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 2.50"
                    value={formData.rewardAmount}
                    onChange={(e) =>
                      updateFormData("rewardAmount", e.target.value)
                    }
                    className="h-11"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Amount paid per approved submission
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeline" className="text-base">
                  Expected Timeline
                </Label>
                <Select
                  value={formData.timeline}
                  onValueChange={(value) => updateFormData("timeline", value)}
                >
                  <SelectTrigger id="timeline" className="h-11">
                    <SelectValue placeholder="Select timeline" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-week">1 Week</SelectItem>
                    <SelectItem value="2-weeks">2 Weeks</SelectItem>
                    <SelectItem value="1-month">1 Month</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  When do you need the data?
                </p>
              </div>
            </div>

            <Separator />

            <div className="rounded-lg border bg-muted/30 p-6">
              <h4 className="mb-4 font-semibold">Cost Estimate</h4>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target samples:</span>
                  <span className="font-medium">
                    {formData.sampleCount || "0"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Reward per sample:
                  </span>
                  <span className="font-medium">
                    {formData.currency} {formData.rewardAmount || "0.00"}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-base">
                  <span className="font-semibold">Estimated Total:</span>
                  <span className="font-bold">
                    {formData.currency}{" "}
                    {(
                      Number(formData.sampleCount || 0) *
                      Number(formData.rewardAmount || 0)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {currentStep === 4 && (
        <Card className="border-2 shadow-sm">
          <CardHeader className="space-y-2 pb-6">
            <CardTitle className="text-2xl">Review Your Request</CardTitle>
            <CardDescription className="text-base">
              Review all details before publishing your dataset request
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <h4 className="mb-3 font-semibold">Basic Information</h4>
                <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-col gap-3">
                    <span className="text-muted-foreground text-sm">
                      Cover Image
                    </span>
                    <div className="relative h-36 w-full overflow-hidden rounded-lg border bg-background">
                      {formData.imageUrl ? (
                        <Image
                          src={formData.imageUrl}
                          alt={`Cover image preview for ${formData.title || "dataset"}`}
                          fill
                          sizes="(max-width: 768px) 100vw, 320px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          No image selected
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Title:</span>
                    <span className="font-medium">
                      {formData.title || "Not set"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Category:</span>
                    <Badge variant="secondary">
                      {formData.category || "Not set"}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Data Type:</span>
                    <Badge variant="secondary">
                      {formData.dataType || "Not set"}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="mb-3 font-semibold">Requirements</h4>
                <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Target Samples:
                    </span>
                    <span className="font-medium">
                      {formData.sampleCount || "0"}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">
                      Quality Criteria:
                    </span>
                    <p className="mt-1 text-xs">
                      {formData.qualityCriteria || "Not specified"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="mb-3 font-semibold">Compensation</h4>
                <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Reward per Sample:
                    </span>
                    <span className="font-medium">
                      {formData.currency} {formData.rewardAmount || "0.00"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Timeline:</span>
                    <span className="font-medium">
                      {formData.timeline || "Not set"}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="font-semibold">Estimated Total:</span>
                    <span className="font-bold">
                      {formData.currency}{" "}
                      {(
                        Number(formData.sampleCount || 0) *
                        Number(formData.rewardAmount || 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between border-t pt-6">
        <Button
          variant="outline"
          size="lg"
          onClick={prevStep}
          disabled={currentStep === 1 || isUploadingImage}
          className="min-w-[120px]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>

        {currentStep < steps.length ? (
          <Button
            size="lg"
            onClick={nextStep}
            className="min-w-[120px]"
            disabled={isUploadingImage}
          >
            {isUploadingImage ? "Uploading..." : "Next"}
            {!isUploadingImage && (
              <ArrowRight className="ml-2 h-4 w-4" />
            )}
          </Button>
        ) : (
          <Button
            size="lg"
            className="min-w-[180px]"
            onClick={handleSubmit}
            disabled={isSubmitting || isUploadingImage}
          >
            <Check className="mr-2 h-4 w-4" />
            {isSubmitting ? "Publishing..." : "Publish Request"}
          </Button>
        )}
      </div>
    </div>
  );
}
