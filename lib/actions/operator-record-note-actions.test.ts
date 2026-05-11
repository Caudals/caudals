import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRowsMock, requireCurrentOperatorMock, revalidatePathMock } =
  vi.hoisted(() => ({
    queryRowsMock: vi.fn(),
    requireCurrentOperatorMock: vi.fn(),
    revalidatePathMock: vi.fn(),
  }));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/auth/operator-session", () => ({
  requireCurrentOperator: requireCurrentOperatorMock,
}));

vi.mock("@/lib/db/client", () => ({
  queryRows: queryRowsMock,
}));

import {
  createOperatorRecordNote,
  deleteOperatorRecordNote,
  listOperatorRecordNotes,
  updateOperatorRecordNote,
} from "@/lib/actions/operator-record-note-actions";

const session = {
  authUser: {
    id: "au_01J2AUTH",
    email: "ops@caudals.local",
    name: "Ops",
    twoFactorEnabled: true,
    passkeyCount: 1,
  },
  operator: {
    id: "op_01J2CURRENT",
    email: "ops@caudals.local",
    name: "Ops",
    role: "admin",
    orgId: "or_01J2OPS",
    mfaRequired: true,
    webauthnRequired: true,
  },
};

const noteRow = {
  id: "on_01J2NOTE",
  module_key: "builds",
  target_type: "build",
  target_id: "bd_01J2RECEIPTS",
  body: "Need QA confirmation before release",
  author: "ops@caudals.local",
  created_at: "2026-05-10T15:00:00.000Z",
  updated_at: "2026-05-10T15:00:00.000Z",
  audit_event_id: "ae_01J2NOTE",
};

describe("operator record note actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCurrentOperatorMock.mockResolvedValue(session);
    queryRowsMock.mockResolvedValue([noteRow]);
  });

  it("lists notes with the operator org RLS session", async () => {
    await expect(
      listOperatorRecordNotes({
        moduleKey: "builds",
        targetType: "build",
        targetId: "bd_01J2RECEIPTS",
      })
    ).resolves.toEqual({
      ok: true,
      notes: [
        {
          id: "on_01J2NOTE",
          moduleKey: "builds",
          targetType: "build",
          targetId: "bd_01J2RECEIPTS",
          body: "Need QA confirmation before release",
          author: "ops@caudals.local",
          createdAt: "2026-05-10T15:00:00.000Z",
          updatedAt: "2026-05-10T15:00:00.000Z",
          auditEventId: "ae_01J2NOTE",
        },
      ],
    });
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM operator_record_note"),
      [
        "or_01J2OPS",
        "builds",
        "build",
        "bd_01J2RECEIPTS",
      ],
      {
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
        serviceRole: false,
      }
    );
  });

  it("creates audited notes", async () => {
    await expect(
      createOperatorRecordNote({
        moduleKey: "builds",
        targetType: "build",
        targetId: "bd_01J2RECEIPTS",
        body: "Need QA confirmation before release",
      })
    ).resolves.toMatchObject({
      ok: true,
      note: {
        id: "on_01J2NOTE",
        auditEventId: "ae_01J2NOTE",
      },
    });
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record_note.created"),
      [
        expect.stringMatching(/^on_/),
        "or_01J2OPS",
        "builds",
        "build",
        "bd_01J2RECEIPTS",
        "Need QA confirmation before release",
        "op_01J2CURRENT",
        expect.stringMatching(/^ae_/),
        "ops@caudals.local",
      ],
      {
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
        serviceRole: false,
      }
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  });

  it("updates audited notes", async () => {
    await expect(
      updateOperatorRecordNote({
        noteId: "on_01J2NOTE",
        body: "Release after duplicate cluster is resolved",
      })
    ).resolves.toMatchObject({
      ok: true,
      note: {
        id: "on_01J2NOTE",
      },
    });
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record_note.updated"),
      [
        "on_01J2NOTE",
        "or_01J2OPS",
        "Release after duplicate cluster is resolved",
        "op_01J2CURRENT",
        expect.stringMatching(/^ae_/),
        "ops@caudals.local",
      ],
      {
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
        serviceRole: false,
      }
    );
  });

  it("soft-deletes audited notes", async () => {
    queryRowsMock.mockResolvedValue([{ id: "on_01J2NOTE" }]);

    await expect(
      deleteOperatorRecordNote({ noteId: "on_01J2NOTE" })
    ).resolves.toEqual({
      ok: true,
      deletedNoteId: "on_01J2NOTE",
    });
    expect(queryRowsMock).toHaveBeenCalledWith(
      expect.stringContaining("operator_record_note.deleted"),
      [
        "on_01J2NOTE",
        "or_01J2OPS",
        "op_01J2CURRENT",
        expect.stringMatching(/^ae_/),
      ],
      {
        orgId: "or_01J2OPS",
        operatorId: "op_01J2CURRENT",
        serviceRole: false,
      }
    );
  });
});
