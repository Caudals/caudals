import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import type { Resend } from "resend";

import {
  addContactEmailToSegment,
  ensureAudienceContact,
} from "./subscribers";

describe("ensureAudienceContact", () => {
  it("creates a contact with normalized details", async () => {
    const create = vi.fn().mockResolvedValue({
      data: { id: "contact-1", object: "contact" },
      error: null,
    });
    const resendMock = { contacts: { create } } as unknown as Resend;

    await expect(
      ensureAudienceContact({
        resendClient: resendMock,
        audienceId: "audience-123",
        email: " Person@Example.com ",
        fullName: "Ada Lovelace",
      })
    ).resolves.toBe(true);

    expect(create).toHaveBeenCalledWith({
      audienceId: "audience-123",
      email: "person@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      unsubscribed: false,
    });
  });

  it("treats existing contacts as success", async () => {
    const create = vi.fn().mockResolvedValue({
      data: null,
      error: { statusCode: 409, message: "Conflict", name: "conflict" },
    });
    const resendMock = { contacts: { create } } as unknown as Resend;

    await expect(
      ensureAudienceContact({
        resendClient: resendMock,
        audienceId: "audience-123",
        email: "user@example.com",
      })
    ).resolves.toBe(true);
  });

  it("bubbles up unexpected errors", async () => {
    const create = vi.fn().mockResolvedValue({
      data: null,
      error: { statusCode: 422, message: "boom", name: "invalid" },
    });
    const resendMock = { contacts: { create } } as unknown as Resend;

    await expect(
      ensureAudienceContact({
        resendClient: resendMock,
        audienceId: "audience-123",
        email: "user@example.com",
      })
    ).rejects.toThrow("boom");
  });
});

describe("addContactEmailToSegment", () => {
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    vi.restoreAllMocks();
  });

  it("calls the Resend segment endpoint with normalized email", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => "",
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      addContactEmailToSegment({
        email: " Person@Example.com ",
        segmentId: "segment-123",
        apiKey: "test-key",
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/contacts/person%40example.com/segments/segment-123",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
        },
      })
    );
  });

  it("does not throw when contact already belongs to the segment", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => "",
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      addContactEmailToSegment({
        email: "user@example.com",
        segmentId: "segment-123",
        apiKey: "test-key",
      })
    ).resolves.toBeUndefined();
  });

  it("attaches response details to thrown errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => '{"error":"internal"}',
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      addContactEmailToSegment({
        email: "user@example.com",
        segmentId: "segment-123",
        apiKey: "test-key",
      })
    ).rejects.toMatchObject({
      status: 500,
      body: { error: "internal" },
    });
  });

  it("propagates network failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      addContactEmailToSegment({
        email: "user@example.com",
        segmentId: "segment-123",
        apiKey: "test-key",
      })
    ).rejects.toThrow("network down");
  });
});
