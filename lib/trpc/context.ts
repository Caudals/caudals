import "server-only";

export type TRPCContext = {
  requestId: string;
  userAgent: string | null;
};

export async function createTRPCContext(input: {
  req: Request;
}): Promise<TRPCContext> {
  return {
    requestId: input.req.headers.get("x-request-id") ?? crypto.randomUUID(),
    userAgent: input.req.headers.get("user-agent"),
  };
}
