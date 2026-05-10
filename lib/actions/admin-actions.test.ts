import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePathMock, createClientMock, createAdminClientMock } =
  vi.hoisted(() => ({
    revalidatePathMock: vi.fn(),
    createClientMock: vi.fn(),
    createAdminClientMock: vi.fn(),
  }));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

import { updateWaitlistStatus } from "@/lib/actions/admin-actions";

type BuilderConfig = {
  awaitResult?: { data?: unknown; error?: { message: string } | null; count?: number | null };
  singleResult?: { data?: unknown; error?: { message: string } | null };
  maybeSingleResult?: { data?: unknown; error?: { message: string } | null };
};

function createBuilder(config: BuilderConfig = {}) {
  const awaitResult = config.awaitResult ?? { data: null, error: null };
  const builder: any = {};

  const chainMethods = [
    "select",
    "eq",
    "in",
    "order",
    "range",
    "limit",
    "gte",
    "lte",
    "or",
    "update",
    "insert",
    "delete",
  ];

  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }

  builder.single = vi.fn(async () => config.singleResult ?? awaitResult);
  builder.maybeSingle = vi.fn(async () => config.maybeSingleResult ?? awaitResult);
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(awaitResult).then(resolve, reject);

  return builder;
}

function createSupabaseMock(params: {
  userId: string;
  fromQueues: Record<string, any[]>;
  role: "admin" | "requester";
}) {
  const queues = new Map<string, any[]>(
    Object.entries(params.fromQueues).map(([key, value]) => [key, [...value]])
  );

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: params.userId } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return createBuilder({
          singleResult: {
            data: { role: params.role },
            error: null,
          },
        });
      }
      const queue = queues.get(table) ?? [];
      if (queue.length === 0) {
        throw new Error(`No queued mock builder for table "${table}"`);
      }
      const next = queue.shift();
      queues.set(table, queue);
      return next;
    }),
  };
}

const USER_ID = "99999999-9999-4999-8999-999999999999";
const WAITLIST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates waitlist status with metadata and activity logging", async () => {
    const adminActivityInsertBuilder = createBuilder({
      awaitResult: { data: null, error: null },
    });
    const supabase = createSupabaseMock({
      userId: USER_ID,
      role: "admin",
      fromQueues: {
        admin_activity_log: [adminActivityInsertBuilder],
      },
    });

    const waitlistFetchBuilder = createBuilder({
      maybeSingleResult: {
        data: {
          id: WAITLIST_ID,
          status: "pending",
          metadata: {},
        },
        error: null,
      },
    });
    const waitlistUpdateBuilder = createBuilder({
      awaitResult: { data: null, error: null },
    });
    const adminClient = {
      from: vi.fn((table: string) => {
        if (table !== "waitlist_signups") {
          throw new Error(`Unexpected admin table "${table}"`);
        }
        const next = [waitlistFetchBuilder, waitlistUpdateBuilder].shift();
        return next;
      }),
    };

    // Stable queue consumption for admin client calls.
    const adminQueue = [waitlistFetchBuilder, waitlistUpdateBuilder];
    (adminClient.from as any).mockImplementation((table: string) => {
      if (table !== "waitlist_signups") {
        throw new Error(`Unexpected admin table "${table}"`);
      }
      const next = adminQueue.shift();
      if (!next) {
        throw new Error("No queued waitlist builder");
      }
      return next;
    });

    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue(adminClient);

    const result = await updateWaitlistStatus(
      WAITLIST_ID,
      "qualified",
      "Reached out and pre-qualified"
    );

    expect(result).toEqual({ ok: true });
    expect(waitlistUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "qualified",
        metadata: expect.objectContaining({
          previous_status: "pending",
          notes: "Reached out and pre-qualified",
        }),
      })
    );
    expect(adminActivityInsertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: USER_ID,
        action_type: "update_waitlist_status",
        target_type: "waitlist_signup",
        target_id: WAITLIST_ID,
      })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
  });

  it("returns FORBIDDEN when non-admin attempts waitlist updates", async () => {
    const supabase = createSupabaseMock({
      userId: USER_ID,
      role: "requester",
      fromQueues: {},
    });
    createClientMock.mockResolvedValue(supabase);
    createAdminClientMock.mockReturnValue({
      from: vi.fn(),
    });

    const result = await updateWaitlistStatus(
      WAITLIST_ID,
      "contacted",
      "Initial outreach"
    );

    expect("error" in result && result.code).toBe("FORBIDDEN");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
