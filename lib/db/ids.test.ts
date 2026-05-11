import { describe, expect, it } from "vitest";
import { generatePrefixedUlid } from "@/lib/db/ids";

describe("generatePrefixedUlid", () => {
  it("generates IDs that match the database prefix check", () => {
    const id = generatePrefixedUlid("wl", new Date("2026-05-10T00:00:00.000Z"));

    expect(id).toMatch(/^wl_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("rejects invalid prefixes", () => {
    expect(() => generatePrefixedUlid("waitlist")).toThrow(
      "ID prefix must be two lowercase letters"
    );
  });
});
