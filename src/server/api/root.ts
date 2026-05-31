import { publicProcedure, router } from "@/server/api/trpc";
import { pricingSessions } from "@/server/db/schema";
import { desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

const healthInputSchema = z.object({
  client: z.literal("review"),
});

const sessionIdInputSchema = z.object({
  id: z.number().int().positive(),
});

const renameSessionInputSchema = sessionIdInputSchema.extend({
  name: z.string().trim().min(1).max(80),
});

function automaticSessionName(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return `Pricing Session ${formatter.format(now)}`;
}

function serializeSession(session: typeof pricingSessions.$inferSelect) {
  return {
    ...session,
    archivedAt: session.archivedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export const appRouter = router({
  app: router({
    health: publicProcedure.input(healthInputSchema).query(({ input }) => ({
      ok: true,
      client: input.client,
      message: "Typed API path ready",
    })),
  }),
  sessions: router({
    list: publicProcedure
      .input(
        z
          .object({
            includeArchived: z.boolean().default(false),
          })
          .default({ includeArchived: false }),
      )
      .query(async ({ ctx, input }) => {
        const sessions = input.includeArchived
          ? await ctx.db
              .select()
              .from(pricingSessions)
              .orderBy(desc(pricingSessions.updatedAt))
          : await ctx.db
              .select()
              .from(pricingSessions)
              .where(isNull(pricingSessions.archivedAt))
              .orderBy(desc(pricingSessions.updatedAt));

        return sessions.map(serializeSession);
      }),
    summary: publicProcedure.query(async ({ ctx }) => {
      const [activeSessions, allSessions] = await Promise.all([
        ctx.db
          .select()
          .from(pricingSessions)
          .where(isNull(pricingSessions.archivedAt)),
        ctx.db.select().from(pricingSessions),
      ]);
      const continueSession = activeSessions.sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      )[0];

      return {
        activeSessionCount: activeSessions.length,
        archivedSessionCount: allSessions.length - activeSessions.length,
        activeReviewCount: activeSessions.reduce(
          (total, session) => total + session.reviewCount,
          0,
        ),
        collectionEstimatedValue: "£0.00",
        continueSession: continueSession ? serializeSession(continueSession) : null,
      };
    }),
    create: publicProcedure.mutation(async ({ ctx }) => {
      const [session] = await ctx.db
        .insert(pricingSessions)
        .values({
          name: automaticSessionName(),
        })
        .returning();

      return serializeSession(session);
    }),
    rename: publicProcedure
      .input(renameSessionInputSchema)
      .mutation(async ({ ctx, input }) => {
        const [session] = await ctx.db
          .update(pricingSessions)
          .set({ name: input.name, updatedAt: new Date() })
          .where(eq(pricingSessions.id, input.id))
          .returning();

        return session ? serializeSession(session) : null;
      }),
    archive: publicProcedure
      .input(sessionIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const [session] = await ctx.db
          .update(pricingSessions)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(pricingSessions.id, input.id))
          .returning();

        return session ? serializeSession(session) : null;
      }),
    unarchive: publicProcedure
      .input(sessionIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const [session] = await ctx.db
          .update(pricingSessions)
          .set({ archivedAt: null, updatedAt: new Date() })
          .where(eq(pricingSessions.id, input.id))
          .returning();

        return session ? serializeSession(session) : null;
      }),
    delete: publicProcedure
      .input(sessionIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const deletedSessions = await ctx.db
          .delete(pricingSessions)
          .where(eq(pricingSessions.id, input.id))
          .returning({ id: pricingSessions.id });

        return { deleted: deletedSessions.length > 0 };
      }),
  }),
});

export type AppRouter = typeof appRouter;
