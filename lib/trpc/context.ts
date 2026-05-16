import "server-only";

export type TRPCContext = {
  headers: Headers;
  requestId: string;
  userAgent: string | null;
};

export async function createTRPCContext(input: {
  req: Request;
}): Promise<TRPCContext> {
  return {
    headers: input.req.headers,
    requestId: input.req.headers.get("x-request-id") ?? crypto.randomUUID(),
    userAgent: input.req.headers.get("user-agent"),
  };
}
