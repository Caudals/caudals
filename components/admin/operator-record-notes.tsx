"use client";

import { useState, useTransition } from "react";
import { MessageSquare, Loader2, Pencil, Trash2 } from "lucide-react";

import {
  createOperatorRecordNote,
  deleteOperatorRecordNote,
  listOperatorRecordNotes,
  updateOperatorRecordNote,
  type OperatorRecordNote,
} from "@/lib/actions/operator-record-note-actions";
import type { OperatorModuleKey } from "@/lib/operator/console-snapshot";
import { useTranslations } from "@/lib/i18n/use-translations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type OperatorRecordNotesProps = {
  className?: string;
  moduleKey: OperatorModuleKey;
  targetType: string;
  targetId: string;
};

export function OperatorRecordNotes({
  className,
  moduleKey,
  targetType,
  targetId,
}: OperatorRecordNotesProps) {
  const t = useTranslations();
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<OperatorRecordNote[]>([]);
  const [body, setBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const noteTarget = {
    moduleKey,
    targetType,
    targetId,
  };

  const loadNotes = () => {
    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const result = await listOperatorRecordNotes(noteTarget);

      if ("error" in result) {
        setError(result.error);
        return;
      }

      setNotes(result.notes);
      setLoaded(true);
    });
  };

  const handleCreate = () => {
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticNote: OperatorRecordNote = {
        id: optimisticId,
        moduleKey,
        targetType,
        targetId,
        body: trimmedBody,
        author: "you",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setNotes((currentNotes) => [optimisticNote, ...currentNotes]);
      setBody("");
      setLoaded(true);

      const result = await createOperatorRecordNote({
        ...noteTarget,
        body: trimmedBody,
      });

      if ("error" in result) {
        setNotes((currentNotes) =>
          currentNotes.filter((note) => note.id !== optimisticId)
        );
        setError(result.error);
        setBody(trimmedBody);
        return;
      }

      if (!("note" in result)) {
        setNotes((currentNotes) =>
          currentNotes.filter((note) => note.id !== optimisticId)
        );
        setError(t("Unexpected note response."));
        setBody(trimmedBody);
        return;
      }

      setNotes((currentNotes) =>
        currentNotes.map((note) =>
          note.id === optimisticId ? result.note : note
        )
      );
      setFeedback(t("Note saved and audit event recorded."));
    });
  };

  const handleUpdate = (noteId: string) => {
    const trimmedBody = editingBody.trim();
    if (!trimmedBody) return;

    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const previousNotes = notes;

      setNotes((currentNotes) =>
        currentNotes.map((note) =>
          note.id === noteId
            ? {
                ...note,
                body: trimmedBody,
                updatedAt: new Date().toISOString(),
              }
            : note
        )
      );
      setEditingNoteId(null);
      setEditingBody("");

      const result = await updateOperatorRecordNote({
        noteId,
        body: trimmedBody,
      });

      if ("error" in result) {
        setNotes(previousNotes);
        setEditingNoteId(noteId);
        setEditingBody(trimmedBody);
        setError(result.error);
        return;
      }

      if (!("note" in result)) {
        setNotes(previousNotes);
        setEditingNoteId(noteId);
        setEditingBody(trimmedBody);
        setError(t("Unexpected note response."));
        return;
      }

      setNotes((currentNotes) =>
        currentNotes.map((note) => (note.id === noteId ? result.note : note))
      );
      setFeedback(t("Note updated and audit event recorded."));
    });
  };

  const handleDelete = (noteId: string) => {
    setError(null);
    setFeedback(null);

    startTransition(async () => {
      const previousNotes = notes;

      setNotes((currentNotes) =>
        currentNotes.filter((note) => note.id !== noteId)
      );

      const result = await deleteOperatorRecordNote({ noteId });

      if ("error" in result) {
        setNotes(previousNotes);
        setError(result.error);
        return;
      }

      setFeedback(t("Note deleted and audit event recorded."));
    });
  };

  return (
    <div
      className={cn(
        "mt-3 rounded-lg border border-gray-100 bg-white p-3",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-950">
          <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
          {t("Operator notes")}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 border-gray-200 bg-white px-2 text-[11px] shadow-none"
          disabled={isPending}
          onClick={loadNotes}
        >
          {isPending && !loaded ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : null}
          {loaded ? t("Refresh") : t("Load notes")}
        </Button>
      </div>

      <div className="mt-3 grid gap-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={isPending}
          placeholder={t("Add an audited note for this record...")}
          className="min-h-16 border-gray-200 bg-gray-50 text-xs shadow-none"
        />
        <Button
          type="button"
          size="sm"
          className="h-8 w-fit bg-gray-950 text-xs text-white shadow-none hover:bg-gray-800"
          disabled={isPending || body.trim().length === 0}
          onClick={handleCreate}
        >
          {isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          {t("Save note")}
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        {loaded && notes.length === 0 ? (
          <p className="rounded-md border border-gray-100 bg-gray-50 p-2 text-xs text-gray-500">
            {t("No notes yet.")}
          </p>
        ) : null}
        {notes.map((note) => (
          <div
            key={note.id}
            className="rounded-md border border-gray-100 bg-gray-50 p-2 text-xs"
          >
            {editingNoteId === note.id ? (
              <div className="grid gap-2">
                <Textarea
                  value={editingBody}
                  onChange={(event) => setEditingBody(event.target.value)}
                  disabled={isPending}
                  className="min-h-16 border-gray-200 bg-white text-xs shadow-none"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 bg-gray-950 text-[11px] text-white shadow-none hover:bg-gray-800"
                    disabled={isPending || editingBody.trim().length === 0}
                    onClick={() => handleUpdate(note.id)}
                  >
                    {t("Update")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-gray-200 bg-white text-[11px] shadow-none"
                    disabled={isPending}
                    onClick={() => {
                      setEditingNoteId(null);
                      setEditingBody("");
                    }}
                  >
                    {t("Cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="leading-5 text-gray-700">{note.body}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
                  <span className="font-mono">
                    {note.id} / {note.author}
                  </span>
                  <span>{new Date(note.updatedAt).toLocaleString("en-US")}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-gray-200 bg-white px-2 text-[11px] shadow-none"
                    disabled={isPending || note.id.startsWith("optimistic-")}
                    onClick={() => {
                      setEditingNoteId(note.id);
                      setEditingBody(note.body);
                    }}
                  >
                    <Pencil className="mr-1.5 h-3 w-3" />
                    {t("Edit")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-gray-200 bg-white px-2 text-[11px] shadow-none"
                    disabled={isPending || note.id.startsWith("optimistic-")}
                    onClick={() => handleDelete(note.id)}
                  >
                    <Trash2 className="mr-1.5 h-3 w-3" />
                    {t("Delete")}
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div aria-live="polite" className="mt-2 min-h-5">
        {error ? (
          <p className="text-xs font-medium text-red-700">{error}</p>
        ) : feedback ? (
          <p className="text-xs font-medium text-emerald-700">{feedback}</p>
        ) : null}
      </div>
    </div>
  );
}
