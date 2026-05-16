import { initTRPC, TRPCError } from "@trpc/server";

import { getBuyerWorkspaceData } from "@/lib/buyer/workspace";
import { getCurrentBuyerSession } from "@/lib/buyer/session";
import { getCurrentSupplierSession } from "@/lib/supplier/session";
import { getSupplierWorkspaceData } from "@/lib/supplier/workspace";
import type { TRPCContext } from "@/lib/trpc/context";

const t = initTRPC.context<TRPCContext>().create();

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

async function requireBuyerSession(ctx: TRPCContext) {
  const lookup = await getCurrentBuyerSession(ctx.headers);

  if (lookup.status === "unauthenticated") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Buyer workspace authentication required",
    });
  }

  if (lookup.status === "unauthorized") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Current account is not assigned to a buyer workspace",
    });
  }

  return lookup.session;
}

async function requireSupplierSession(ctx: TRPCContext) {
  const lookup = await getCurrentSupplierSession(ctx.headers);

  if (lookup.status === "unauthenticated") {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Supplier portal authentication required",
    });
  }

  if (lookup.status === "unauthorized") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Current account is not assigned to a supplier portal",
    });
  }

  return lookup.session;
}

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(({ ctx }) => ({
    ok: true,
    surface: "future_buyer_supplier_scaffold" as const,
    requestId: ctx.requestId,
  })),
  buyer: createTRPCRouter({
    workspace: publicProcedure.query(async ({ ctx }) => {
      const session = await requireBuyerSession(ctx);
      return getBuyerWorkspaceData(session);
    }),
  }),
  supplier: createTRPCRouter({
    workspace: publicProcedure.query(async ({ ctx }) => {
      const session = await requireSupplierSession(ctx);
      return getSupplierWorkspaceData(session);
    }),
  }),
});

export type AppRouter = typeof appRouter;
