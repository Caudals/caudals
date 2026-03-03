import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logWarn } from "@/lib/security/structured-logger";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, RateLimitEntry>;

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
};

declare global {
  var __caudalsRateLimitStore: RateLimitStore | undefined;
  var __caudalsRateLimitRpcFallbackWarned: boolean | undefined;
}

const MAX_STORE_KEYS = 10_000;

function getStore(): RateLimitStore {
  if (!globalThis.__caudalsRateLimitStore) {
    globalThis.__caudalsRateLimitStore = new Map<string, RateLimitEntry>();
  }

  return globalThis.__caudalsRateLimitStore;
}

function cleanupExpiredEntries(store: RateLimitStore, now: number) {
  if (store.size < MAX_STORE_KEYS) {
    return;
  }

  for (const [key, value] of store.entries()) {
    if (value.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function getClientIpFromHeaders(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const directIp =
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-client-ip") ??
    headers.get("true-client-ip");

  return directIp?.trim() || "unknown";
}

function hashRateLimitKey(rawKey: string) {
  return createHash("sha256").update(rawKey).digest("hex");
}

function consumeRateLimitInMemory({
  key,
  limit,
  windowMs,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const store = getStore();

  cleanupExpiredEntries(store, now);

  const current = store.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      retryAfterSeconds: 0,
      resetAt,
    };
  }

  const nextCount = current.count + 1;
  current.count = nextCount;
  store.set(key, current);

  const allowed = nextCount <= limit;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - nextCount),
    retryAfterSeconds,
    resetAt: current.resetAt,
  };
}

type ConsumeRateLimitRpcRow = {
  allowed?: boolean;
  limit_count?: number;
  remaining?: number;
  retry_after_seconds?: number;
  reset_at?: string;
};

export async function consumeRateLimit({
  key,
  limit,
  windowMs,
}: RateLimitOptions): Promise<RateLimitResult> {
  const keyHash = `rl:${hashRateLimitKey(key)}`;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  try {
    const adminClient = createAdminClient("abuse_controls") as any;
    const { data, error } = await adminClient.rpc("consume_abuse_rate_limit", {
      p_key: keyHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      throw error;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | ConsumeRateLimitRpcRow
      | null
      | undefined;

    if (!row) {
      throw new Error("consume_abuse_rate_limit returned no data");
    }

    const resetAtMs = new Date(String(row.reset_at ?? "")).getTime();
    const safeResetAt = Number.isFinite(resetAtMs)
      ? resetAtMs
      : Date.now() + windowSeconds * 1000;

    return {
      allowed: Boolean(row.allowed),
      limit: Number(row.limit_count ?? limit),
      remaining: Math.max(0, Number(row.remaining ?? 0)),
      retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds ?? 0)),
      resetAt: safeResetAt,
    };
  } catch (error) {
    if (!globalThis.__caudalsRateLimitRpcFallbackWarned) {
      globalThis.__caudalsRateLimitRpcFallbackWarned = true;
      logWarn("rate_limit.rpc_unavailable_fallback_memory", {
        error,
      });
    }

    return consumeRateLimitInMemory({
      key: keyHash,
      limit,
      windowMs,
    });
  }
}

export function __resetRateLimitMemoryStoreForTests() {
  globalThis.__caudalsRateLimitStore = new Map<string, RateLimitEntry>();
  globalThis.__caudalsRateLimitRpcFallbackWarned = false;
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const resetInSeconds = Math.max(
    0,
    Math.ceil((result.resetAt - Date.now()) / 1000)
  );

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(resetInSeconds),
  };

  if (!result.allowed && result.retryAfterSeconds > 0) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}
