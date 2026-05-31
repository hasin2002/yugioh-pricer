import { initTRPC } from "@trpc/server";

import { db } from "@/server/db";

export function createTRPCContext() {
  return { db };
}

type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
