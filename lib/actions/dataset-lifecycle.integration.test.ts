import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { createRequesterDataset } from "@/lib/actions/requester-actions";
import { adminUpdateDatasetApproval } from "@/lib/actions/admin-actions";
import {
  createSubmission,
  updateSubmissionStatus,
} from "@/lib/actions/submission-actions";

type TableName =
  | "profiles"
  | "dataset_requests"
  | "dataset_activity"
  | "admin_activity_log"
  | "submissions";

type Row = Record<string, any>;
type DatabaseState = Record<TableName, Row[]>;

type UserContext = {
  id: string;
  role: "requester" | "contributor" | "admin";
  email: string;
};

function matchesFilters(row: Row, filters: Array<{ column: string; value: any }>) {
  return filters.every((filter) => row[filter.column] === filter.value);
}

class FakeQueryBuilder {
  private filters: Array<{ column: string; value: any }> = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: any = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private wantsSelect = false;

  constructor(
    private readonly db: DatabaseState,
    private readonly table: TableName
  ) {}

  select(_fields?: string) {
    this.wantsSelect = true;
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  insert(payload: any) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.op = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  in(_column: string, _values: any[]) {
    return this;
  }

  range(_from: number, _to: number) {
    return this;
  }

  limit(_count: number) {
    return this;
  }

  gte(_column: string, _value: any) {
    return this;
  }

  lte(_column: string, _value: any) {
    return this;
  }

  or(_query: string) {
    return this;
  }

  async single() {
    const result = await this.execute();
    if (result.error) return result;
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row) {
      return { data: null, error: { message: "No rows found" } };
    }
    return { data: row, error: null };
  }

  async maybeSingle() {
    const result = await this.execute();
    if (result.error) return result;
    const row = Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null;
    return { data: row, error: null };
  }

  then(
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown
  ) {
    return this.execute().then(resolve, reject);
  }

  private async execute() {
    const tableRows = this.db[this.table];

    if (this.op === "insert") {
      const inputRows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = inputRows.map((input) => {
        const row = { ...input };
        if (!row.id) row.id = randomUUID();
        if (!row.created_at) row.created_at = new Date().toISOString();
        if (!row.updated_at) row.updated_at = row.created_at;
        tableRows.push(row);
        return row;
      });

      return {
        data: this.wantsSelect ? (Array.isArray(this.payload) ? inserted : inserted[0]) : null,
        error: null,
      };
    }

    if (this.op === "update") {
      const updated = tableRows
        .filter((row) => matchesFilters(row, this.filters))
        .map((row) => {
          Object.assign(row, this.payload);
          if (!row.updated_at) {
            row.updated_at = new Date().toISOString();
          }
          return row;
        });

      return {
        data: this.wantsSelect ? (updated.length <= 1 ? updated[0] ?? null : updated) : null,
        error: null,
      };
    }

    if (this.op === "delete") {
      const remaining = tableRows.filter((row) => !matchesFilters(row, this.filters));
      this.db[this.table] = remaining as any;
      return { data: null, error: null };
    }

    let rows = tableRows.filter((row) => matchesFilters(row, this.filters));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => {
        const left = a[column];
        const right = b[column];
        if (left === right) return 0;
        if (left == null) return ascending ? -1 : 1;
        if (right == null) return ascending ? 1 : -1;
        return left > right ? (ascending ? 1 : -1) : ascending ? -1 : 1;
      });
    }

    return { data: rows, error: null };
  }
}

function createFakeSupabase(db: DatabaseState, userRef: { current: UserContext }) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: userRef.current.id, email: userRef.current.email } },
        error: null,
      })),
    },
    from: vi.fn((table: TableName) => new FakeQueryBuilder(db, table)),
  };
}

describe("dataset lifecycle integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs request -> approve -> fund -> submit -> approve flow end-to-end", async () => {
    const requesterId = "11111111-1111-4111-8111-111111111111";
    const adminId = "22222222-2222-4222-8222-222222222222";
    const contributorId = "33333333-3333-4333-8333-333333333333";

    const db: DatabaseState = {
      profiles: [
        { id: requesterId, role: "requester", full_name: "Requester One" },
        { id: adminId, role: "admin", full_name: "Admin One" },
        { id: contributorId, role: "contributor", full_name: "Contributor One" },
      ],
      dataset_requests: [],
      dataset_activity: [],
      admin_activity_log: [],
      submissions: [],
    };

    const userRef: { current: UserContext } = {
      current: {
        id: requesterId,
        role: "requester",
        email: "requester@example.com",
      },
    };

    const supabase = createFakeSupabase(db, userRef);
    createClientMock.mockResolvedValue(supabase);

    // Step 1: requester creates dataset request
    const created = await createRequesterDataset({
      title: "Lifecycle Dataset",
      description: "Integration flow dataset for lifecycle coverage.",
      category: "computer-vision",
      dataType: "image",
      samplesNeeded: 12,
      rewardAmount: 1.5,
      currency: "USD",
      deadline: "2026-12-31",
      imageUrl: "",
      qualityCriteria: ["Clear focus"],
      requirements: ["RGB JPG"],
      publish: false,
    });

    expect("id" in created).toBe(true);
    if (!("id" in created)) return;
    const datasetId = created.id;

    // Step 2: admin approves dataset request
    userRef.current = {
      id: adminId,
      role: "admin",
      email: "admin@example.com",
    };
    const approved = await adminUpdateDatasetApproval(datasetId, "approved");
    expect("data" in approved).toBe(true);

    // Step 3: funding applied (simulated payment completion state)
    const dataset = db.dataset_requests.find((row) => row.id === datasetId);
    expect(dataset).toBeTruthy();
    if (!dataset) return;
    dataset.payment_status = "paid";
    dataset.paid_amount = dataset.total_budget;
    dataset.status = "active";

    // Step 4: contributor submits work
    userRef.current = {
      id: contributorId,
      role: "contributor",
      email: "contributor@example.com",
    };
    const submissionRes = await createSubmission({
      datasetRequestId: datasetId,
      fileUrls: ["https://example.com/submission/file-1.json"],
      metadata: { source: "integration-test" },
      notes: "Initial submission",
    });

    expect("data" in submissionRes).toBe(true);
    if (!("data" in submissionRes) || !submissionRes.data) return;
    const submissionId = submissionRes.data.id as string;

    // Step 5: requester/admin approves submission
    userRef.current = {
      id: requesterId,
      role: "requester",
      email: "requester@example.com",
    };
    const finalApproval = await updateSubmissionStatus(
      submissionId,
      "approved",
      "Looks good"
    );

    expect("data" in finalApproval).toBe(true);
    expect(
      db.submissions.find((row) => row.id === submissionId)?.status
    ).toBe("approved");
    expect(
      db.dataset_requests.find((row) => row.id === datasetId)?.approval_status
    ).toBe("approved");
    expect(
      db.dataset_requests.find((row) => row.id === datasetId)?.payment_status
    ).toBe("paid");
    expect(db.dataset_activity.length).toBeGreaterThan(0);
    expect(db.admin_activity_log.length).toBeGreaterThan(0);
  });
});
