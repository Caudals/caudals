"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addSupportTicketReply } from "@/lib/actions/requester-actions";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";

type TicketMessage = {
  id: string;
  role: "requester" | "admin" | "system";
  body: string;
  created_at: string;
};

export function TicketThread({
  ticketId,
  status,
  messages,
}: {
  ticketId: string;
  status: string;
  messages: TicketMessage[];
}) {
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [nextStatus, setNextStatus] = useState(status);
  const toast = useLocaleToast();
  const t = useTranslations();
  const router = useRouter();

  const submit = () => {
    startTransition(async () => {
      const result = await addSupportTicketReply({
        ticketId,
        body,
        status: nextStatus,
      });
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Reply sent");
        setBody("");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-slate-500">
            {t("No messages yet.")}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className="rounded-xl border border-border p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge variant="outline" className="capitalize">
                  {message.role.replaceAll("_", " ")}
                </Badge>
                <span className="text-xs text-slate-500">
                  {new Date(message.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-sm">{message.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border  p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <div className="space-y-2">
            <Label>{t("Add reply")}</Label>
            <Textarea
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t("Share additional context, screenshots, or expected behavior.")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("Status")}</Label>
            <Select value={nextStatus} onValueChange={setNextStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">{t("open")}</SelectItem>
                <SelectItem value="in_progress">{t("in_progress")}</SelectItem>
                <SelectItem value="resolved">{t("resolved")}</SelectItem>
                <SelectItem value="closed">{t("closed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            disabled={isPending || body.trim().length === 0}
            onClick={submit}
          >
            {t("Send update")}
          </Button>
        </div>
      </div>
    </div>
  );
}
