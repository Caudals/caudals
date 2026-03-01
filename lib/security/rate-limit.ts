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

export function consumeRateLimit({
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
