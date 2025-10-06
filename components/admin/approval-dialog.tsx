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
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  approveDatasetRequest,
  rejectDatasetRequest,
  approveSubmission,
  rejectSubmission,
} from "@/lib/actions/admin-actions";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { categoryLabels, dataTypeLabels } from "@/lib/data/datasets";
import { Separator } from "@/components/ui/separator";

interface ApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  item: {
    id: string;
    title?: string;
    description?: string;
    category?: string;
    data_type?: string;
    samples_needed?: number;
    reward_amount?: number;
    currency?: string;
    quality_criteria?: string[];
    requirements?: string[];
    file_urls?: string[];
    notes?: string;
    dataset_requests?: { title: string };
    profiles?: { full_name: string };
  };
  type: "approve" | "reject" | "view";
  itemType: "request" | "submission";
}

export function ApprovalDialog({
  open,
  onClose,
  item,
  type,
  itemType,
}: ApprovalDialogProps) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = async () => {
    setIsSubmitting(true);

    try {
      const result =
        itemType === "request"
          ? await approveDatasetRequest(item.id, notes || undefined)
          : await approveSubmission(item.id, notes || undefined);

      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(
          `${
            itemType === "request" ? "Dataset request" : "Submission"
          } approved successfully!`
        );
        onClose();
        router.refresh();
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!notes.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }

    setIsSubmitting(true);

    try {
      const result =
        itemType === "request"
          ? await rejectDatasetRequest(item.id, notes)
          : await rejectSubmission(item.id, notes);

      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success(
          `${
            itemType === "request" ? "Dataset request" : "Submission"
          } rejected`
        );
        onClose();
        router.refresh();
      }
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {type === "approve"
              ? "Approve"
              : type === "reject"
              ? "Reject"
              : "Review"}{" "}
            {itemType === "request" ? "Dataset Request" : "Submission"}
          </DialogTitle>
          <DialogDescription>
            {type === "view"
              ? "Review the details below"
              : type === "approve"
              ? "Confirm approval of this item"
              : "Provide a reason for rejection"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {itemType === "request" ? (
            <>
              <div>
                <h4 className="font-semibold mb-2">Title</h4>
                <p className="text-sm">{item.title}</p>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">Description</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Category</h4>
                  <Badge variant="outline">
                    {item.category && categoryLabels[item.category]
                      ? categoryLabels[item.category]
                      : item.category || "N/A"}
                  </Badge>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Data Type</h4>
                  <Badge variant="secondary">
                    {item.data_type && dataTypeLabels[item.data_type]
                      ? dataTypeLabels[item.data_type]
                      : item.data_type || "N/A"}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Samples Needed</h4>
                  <p className="text-sm">
                    {item.samples_needed?.toLocaleString() || "N/A"}
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Reward per Sample</h4>
                  <p className="text-sm">
                    ${item.reward_amount || 0} {item.currency || "USD"}
                  </p>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">Quality Criteria</h4>
                <ul className="list-disc list-inside space-y-1">
                  {item.quality_criteria?.map(
                    (criterion: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground">
                        {criterion}
                      </li>
                    )
                  )}
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Requirements</h4>
                <ul className="list-disc list-inside space-y-1">
                  {item.requirements?.map((req: string, i: number) => (
                    <li key={i} className="text-sm text-muted-foreground">
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <>
              <div>
                <h4 className="font-semibold mb-2">Dataset</h4>
                <p className="text-sm">
                  {item.dataset_requests?.title || "Unknown"}
                </p>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">Contributor</h4>
                <p className="text-sm">
                  {item.profiles?.full_name || "Anonymous"}
                </p>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">Files Submitted</h4>
                <p className="text-sm text-muted-foreground">
                  {item.file_urls?.length || 0} file(s)
                </p>
              </div>

              {item.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-semibold mb-2">Contributor Notes</h4>
                    <p className="text-sm text-muted-foreground">
                      {item.notes}
                    </p>
                  </div>
                </>
              )}
            </>
          )}

          {type !== "view" && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="admin-notes">
                  {type === "reject" ? "Rejection Reason*" : "Notes (Optional)"}
                </Label>
                <Textarea
                  id="admin-notes"
                  placeholder={
                    type === "reject"
                      ? "Explain why this is being rejected..."
                      : "Add any notes or feedback..."
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {type === "view" ? "Close" : "Cancel"}
          </Button>
          {type === "approve" && (
            <Button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
          )}
          {type === "reject" && (
            <Button
              onClick={handleReject}
              disabled={isSubmitting}
              variant="destructive"
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
