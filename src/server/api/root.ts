import { publicProcedure, router } from "@/server/api/trpc";
import {
  ensureCardMetadataFresh,
  getCardMetadataStatus,
  refreshCardMetadataCache,
  searchCardMetadata,
} from "@/server/cards/metadata-cache";
import {
  CARD_CONDITIONS,
  CARD_EDITIONS,
  DEFAULT_CARD_LANGUAGE,
} from "@/lib/printing-options";
import { pricingSessions, sessionItems } from "@/server/db/schema";
import { desc, eq, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
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

const joinSessionInputSchema = z.object({
  joinCode: z.string().trim().min(1),
  clientId: z.string().trim().min(8).max(128),
  replaceExisting: z.boolean().default(false),
});

const cardSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(120),
});

const cardEditionSchema = z.enum(CARD_EDITIONS);

const cardConditionSchema = z.enum(CARD_CONDITIONS);

const manualSessionItemInputSchema = sessionIdInputSchema.extend({
  cardName: z.string().trim().min(1).max(160),
  setCode: z.string().trim().min(1).max(40),
  passcode: z.string().trim().min(1).max(40),
  rarity: z.string().trim().min(1).max(80),
  edition: cardEditionSchema.default("1st Edition"),
  language: z.string().trim().min(1).max(40).default(DEFAULT_CARD_LANGUAGE),
  condition: cardConditionSchema.default("Mint"),
  quantity: z.number().int().min(1).max(999).default(1),
});

function automaticSessionName(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return `Pricing Session ${formatter.format(now)}`;
}

function createJoinCode() {
  return randomBytes(5).toString("base64url").toUpperCase();
}

function configuredPhoneSafeOrigin() {
  const origin = process.env.PHONE_SAFE_HTTPS_ORIGIN?.trim();

  if (!origin) {
    return null;
  }

  try {
    const url = new URL(origin);

    if (url.protocol !== "https:") {
      return null;
    }

    url.pathname = "";
    url.search = "";
    url.hash = "";

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function joinUrlFor(joinCode: string) {
  const origin = configuredPhoneSafeOrigin();

  return origin ? `${origin}/capture?join=${encodeURIComponent(joinCode)}` : null;
}

function qrSvgFor(value: string) {
  const qrCode = QRCode.create(value, { errorCorrectionLevel: "M" });
  const quietZone = 4;
  const size = qrCode.modules.size + quietZone * 2;
  const rects = Array.from(qrCode.modules.data)
    .map((enabled, index) => {
      if (!enabled) {
        return "";
      }

      const x = (index % qrCode.modules.size) + quietZone;
      const y = Math.floor(index / qrCode.modules.size) + quietZone;

      return `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${size}v${size}H0z"/><g fill="#151923">${rects}</g></svg>`;
}

function serializeSession(session: typeof pricingSessions.$inferSelect) {
  const joinUrl = joinUrlFor(session.joinCode);

  return {
    ...session,
    joinUrl,
    joinQrSvg: joinUrl ? qrSvgFor(joinUrl) : null,
    phoneSafeOriginConfigured: joinUrl !== null,
    activeCaptureClientJoinedAt:
      session.activeCaptureClientJoinedAt?.toISOString() ?? null,
    archivedAt: session.archivedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

function serializeSessionItem(item: typeof sessionItems.$inferSelect) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
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
  cards: router({
    metadataStatus: publicProcedure.query(({ ctx }) =>
      getCardMetadataStatus(ctx.db),
    ),
    refreshMetadata: publicProcedure.mutation(({ ctx }) =>
      refreshCardMetadataCache(ctx.db),
    ),
    searchMetadata: publicProcedure
      .input(cardSearchInputSchema)
      .query(async ({ ctx, input }) => {
        await ensureCardMetadataFresh(ctx.db);

        return searchCardMetadata(ctx.db, input.query);
      }),
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
          joinCode: createJoinCode(),
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
    items: publicProcedure
      .input(sessionIdInputSchema)
      .query(async ({ ctx, input }) => {
        const items = await ctx.db
          .select()
          .from(sessionItems)
          .where(eq(sessionItems.sessionId, input.id))
          .orderBy(desc(sessionItems.createdAt));

        return items.map(serializeSessionItem);
      }),
    addManualItem: publicProcedure
      .input(manualSessionItemInputSchema)
      .mutation(async ({ ctx, input }) => {
        const [session] = await ctx.db
          .select()
          .from(pricingSessions)
          .where(eq(pricingSessions.id, input.id));

        if (!session) {
          return null;
        }

        const now = new Date();
        const [item] = await ctx.db
          .insert(sessionItems)
          .values({
            sessionId: input.id,
            bestFrameId: null,
            entrySource: "manual",
            cardName: input.cardName,
            setCode: input.setCode,
            passcode: input.passcode,
            rarity: input.rarity,
            edition: input.edition,
            language: input.language,
            condition: input.condition,
            quantity: input.quantity,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await ctx.db
          .update(pricingSessions)
          .set({
            reviewCount: session.reviewCount + input.quantity,
            updatedAt: now,
          })
          .where(eq(pricingSessions.id, input.id));

        return serializeSessionItem(item);
      }),
  }),
  capture: router({
    join: publicProcedure
      .input(joinSessionInputSchema)
      .mutation(async ({ ctx, input }) => {
        const [session] = await ctx.db
          .select()
          .from(pricingSessions)
          .where(eq(pricingSessions.joinCode, input.joinCode));

        if (!session) {
          return {
            status: "not_found" as const,
            session: null,
            activeCaptureClientId: null,
          };
        }

        if (
          session.activeCaptureClientId &&
          session.activeCaptureClientId !== input.clientId &&
          !input.replaceExisting
        ) {
          return {
            status: "already_claimed" as const,
            session: serializeSession(session),
            activeCaptureClientId: session.activeCaptureClientId,
          };
        }

        const [updatedSession] = await ctx.db
          .update(pricingSessions)
          .set({
            activeCaptureClientId: input.clientId,
            activeCaptureClientJoinedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(pricingSessions.id, session.id))
          .returning();

        return {
          status: "joined" as const,
          session: serializeSession(updatedSession),
          activeCaptureClientId: updatedSession.activeCaptureClientId,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
