import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidatePathMock, createClientMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import {
  duplicateDataset,
  getRequesterDatasets,
  updateDatasetStatus,
} from "@/lib/actions/requester-actions";

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

const USER_ID = "11111111-1111-4111-8111-111111111111";
const DATASET_ID = "22222222-2222-4222-8222-222222222222";
const DUPLICATED_ID = "33333333-3333-4333-8333-333333333333";

describe("requester actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns CONFLICT for invalid status transitions", async () => {
    const profileBuilder = createBuilder({
      maybeSingleResult: { data: { role: "requester" }, error: null },
    });
    const datasetFetchBuilder = createBuilder({
      singleResult: {
        data: { id: DATASET_ID, status: "draft", title: "Dataset A" },
        error: null,
      },
    });

    const supabase = createSupabaseMock({
      userId: USER_ID,
      fromQueues: {
        profiles: [profileBuilder],
        dataset_requests: [datasetFetchBuilder],
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await updateDatasetStatus(DATASET_ID, "paused");

    expect("error" in result && result.code).toBe("CONFLICT");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("updates status, writes activity, and revalidates on valid transitions", async () => {
    const profileBuilder = createBuilder({
      maybeSingleResult: { data: { role: "requester" }, error: null },
    });
    const datasetFetchBuilder = createBuilder({
      singleResult: {
        data: { id: DATASET_ID, status: "paused", title: "Dataset B" },
        error: null,
      },
    });
    const datasetUpdateBuilder = createBuilder({
      awaitResult: { data: null, error: null },
    });
    const activityBuilder = createBuilder({
      awaitResult: { data: null, error: null },
    });

    const supabase = createSupabaseMock({
      userId: USER_ID,
      fromQueues: {
        profiles: [profileBuilder],
        dataset_requests: [datasetFetchBuilder, datasetUpdateBuilder],
        dataset_activity: [activityBuilder],
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await updateDatasetStatus(DATASET_ID, "active");

    expect(result).toEqual({ ok: true });
    expect(datasetUpdateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
      })
    );
    expect(activityBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset_request_id: DATASET_ID,
        actor_id: USER_ID,
        action: "status_updated",
      })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/requester");
    expect(revalidatePathMock).toHaveBeenCalledWith("/requester/datasets");
    expect(revalidatePathMock).toHaveBeenCalledWith(`/requester/datasets/${DATASET_ID}`);
  });

  it("duplicates datasets as drafts with reset counters", async () => {
    const profileBuilder = createBuilder({
      maybeSingleResult: { data: { role: "requester" }, error: null },
    });
    const sourceBuilder = createBuilder({
      singleResult: {
        data: {
          id: DATASET_ID,
          title: "Road Signs",
          description: "Collect street signs",
          category: "computer-vision",
          data_type: "image",
          samples_needed: 10,
          reward_amount: 2.5,
          currency: "USD",
          deadline: "2026-03-31",
          quality_criteria: ["Readable signs"],
          requirements: ["Daylight"],
          image_url: null,
          attachments: [],
          automation_config: {},
          funding_model: "upfront",
          commission_percentage: 10,
        },
        error: null,
      },
    });
    const insertBuilder = createBuilder({
      singleResult: {
        data: { id: DUPLICATED_ID },
        error: null,
      },
    });
    const activityBuilder = createBuilder({
      awaitResult: { data: null, error: null },
    });

    const supabase = createSupabaseMock({
      userId: USER_ID,
      fromQueues: {
        profiles: [profileBuilder],
        dataset_requests: [sourceBuilder, insertBuilder],
        dataset_activity: [activityBuilder],
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await duplicateDataset(DATASET_ID);

    expect(result).toEqual({ ok: true });
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        created_by: USER_ID,
        status: "draft",
        approval_status: "pending",
        samples_collected: 0,
        total_budget: 25,
      })
    );
    expect(activityBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset_request_id: DUPLICATED_ID,
        action: "duplicated_from",
      })
    );
  });

  it("applies quick filters to requester dataset lists", async () => {
    const profileBuilder = createBuilder({
      maybeSingleResult: { data: { role: "requester" }, error: null },
    });
    const datasetsBuilder = createBuilder({
      awaitResult: {
        data: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            title: "Needs review",
            description: "Pending submission case",
            status: "active",
            approval_status: "approved",
            reward_amount: 1.2,
            data_type: "image",
            samples_collected: 5,
            samples_needed: 10,
            total_budget: 12,
            paid_amount: 12,
            payment_status: "paid",
            created_at: "2026-03-01T10:00:00.000Z",
            submissions: [{ status: "pending" }],
          },
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            title: "No review",
            description: "No pending work",
            status: "active",
            approval_status: "approved",
            reward_amount: 1,
            data_type: "text",
            samples_collected: 8,
            samples_needed: 10,
            total_budget: 10,
            paid_amount: 10,
            payment_status: "paid",
            created_at: "2026-03-01T09:00:00.000Z",
            submissions: [{ status: "approved" }],
          },
        ],
        error: null,
      },
    });
    const exportsBuilder = createBuilder({
      awaitResult: {
        data: [],
        error: null,
      },
    });

    const supabase = createSupabaseMock({
      userId: USER_ID,
      fromQueues: {
        profiles: [profileBuilder],
        dataset_requests: [datasetsBuilder],
        dataset_exports: [exportsBuilder],
      },
    });
    createClientMock.mockResolvedValue(supabase);

    const result = await getRequesterDatasets({
      quickFilter: "pending_review",
      page: 1,
      perPage: 10,
    });

    expect("items" in result && result.total).toBe(1);
    if ("items" in result) {
      expect(result.items[0]?.title).toBe("Needs review");
      expect(result.items[0]?.pendingSubmissions).toBe(1);
    }
  });
});
