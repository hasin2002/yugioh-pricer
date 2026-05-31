import { publicProcedure, router } from "@/server/api/trpc";
import { z } from "zod";

const healthInputSchema = z.object({
  client: z.literal("review"),
});

export const appRouter = router({
  app: router({
    health: publicProcedure.input(healthInputSchema).query(({ input }) => ({
      ok: true,
      client: input.client,
      message: "Typed API path ready",
    })),
  }),
});

export type AppRouter = typeof appRouter;
