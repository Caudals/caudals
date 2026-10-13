import { api } from "@/lib/evals/domain/http";
import { creditUsageForPlatform } from "@/lib/billing/ops";

export const runtime = "nodejs";

// Platform roles (L-16): credits sold, granted, consumed, held, expired and refunded per workspace (?month=YYYY-MM).
export const GET = api(async (request, identity) => creditUsageForPlatform(identity, new URL(request.url).searchParams));
