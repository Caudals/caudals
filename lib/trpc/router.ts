import { initTRPC } from "@trpc/server";
import type { TRPCContext } from "@/lib/trpc/context";

const t = initTRPC.context<TRPCContext>().create();

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(({ ctx }) => ({
    ok: true,
    surface: "future_buyer_supplier_scaffold" as const,
    requestId: ctx.requestId,
  })),
});

export type AppRouter = typeof appRouter;
