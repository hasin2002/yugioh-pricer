import { initTRPC } from "@trpc/server";

import { refreshCardMetadataOnServerStart } from "@/server/cards/metadata-cache";
import { db } from "@/server/db";

if (
  process.env.NODE_ENV !== "test" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  refreshCardMetadataOnServerStart(db);
}

export function createTRPCContext() {
  return { db };
}

type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
