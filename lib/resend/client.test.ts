import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resendConstructorMock } = vi.hoisted(() => ({
  resendConstructorMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: resendConstructorMock,
}));

const tempDirs: string[] = [];

function writeTempSecret(value: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "caudals-resend-secret-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, "api-key");
  writeFileSync(filePath, value, "utf8");
  return filePath;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  resendConstructorMock.mockReset();
  resendConstructorMock.mockImplementation((apiKey: string) => ({
    apiKey,
    emails: { send: vi.fn() },
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("getResendClient", () => {
  it("reads RESEND_API_KEY from a secret file", async () => {
    const filePath = writeTempSecret("re_file_secret\n");
    vi.stubEnv("RESEND_API_KEY_FILE", filePath);

    const { getResendClient } = await import("@/lib/resend/client");
    const client = getResendClient();

    expect(resendConstructorMock).toHaveBeenCalledWith("re_file_secret");
    expect(client).toMatchObject({ apiKey: "re_file_secret" });
  });

  it("prefers an explicit option over env secrets", async () => {
    const filePath = writeTempSecret("re_file_secret\n");
    vi.stubEnv("RESEND_API_KEY_FILE", filePath);

    const { getResendClient } = await import("@/lib/resend/client");

    getResendClient({ apiKey: "re_option_secret" });

    expect(resendConstructorMock).toHaveBeenCalledWith("re_option_secret");
  });
});
