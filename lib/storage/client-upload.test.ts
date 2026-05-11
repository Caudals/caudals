import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteFileClient,
  uploadFileClient,
} from "@/lib/storage/client-upload";

describe("client upload helpers", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("delegates uploads to the server upload API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        url: "https://cdn.caudals.test/dataset-files/ds_01/file.txt",
        path: "ds_01/op_01/file.txt",
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const file = new File(["hello"], "file.txt", { type: "text/plain" });

    await expect(uploadFileClient(file, "dataset-files", "ds_01")).resolves.toEqual({
      url: "https://cdn.caudals.test/dataset-files/ds_01/file.txt",
      path: "ds_01/op_01/file.txt",
      error: null,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/upload", {
      method: "POST",
      body: expect.any(FormData),
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("bucket")).toBe("dataset-files");
    expect(body.get("datasetId")).toBe("ds_01");
  });

  it("passes server upload errors through", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Not authenticated" }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const file = new File(["hello"], "file.txt", { type: "text/plain" });

    await expect(uploadFileClient(file, "dataset-files")).resolves.toEqual({
      url: null,
      path: null,
      error: "Not authenticated",
    });
  });

  it("delegates deletes to the server upload API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(deleteFileClient("dataset-files", "ds_01/op_01/file.txt")).resolves.toEqual({
      success: true,
      error: null,
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/upload", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bucket: "dataset-files",
        path: "ds_01/op_01/file.txt",
      }),
    });
  });
});
