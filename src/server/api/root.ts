import { publicProcedure, router } from "@/server/api/trpc";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
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
import { fetchAndStorePriceSnapshot } from "@/server/cards/pricing";
import {
  cardMetadataCards,
  priceSnapshots,
  pricingSessions,
  sessionItems,
} from "@/server/db/schema";
import { desc, eq, inArray, isNull } from "drizzle-orm";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type * as schema from "@/server/db/schema";

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

const serialNumberInputSchema = z
  .object({
    passcode: z.string().trim().min(1).max(40).optional(),
    serialNumber: z.string().trim().min(1).max(40).optional(),
  })
  .transform((input, ctx) => {
    const serialNumber = input.serialNumber ?? input.passcode;

    if (!serialNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Serial Number is required",
        path: ["serialNumber"],
      });

      return z.NEVER;
    }

    return {
      passcode: serialNumber,
      serialNumber,
    };
  });

const manualSessionItemInputSchema = sessionIdInputSchema
  .extend({
  cardName: z.string().trim().min(1).max(160),
  setCode: z.string().trim().min(1).max(40),
  rarity: z.string().trim().min(1).max(80),
  edition: cardEditionSchema.default("1st Edition"),
  language: z.string().trim().min(1).max(40).default(DEFAULT_CARD_LANGUAGE),
  condition: cardConditionSchema.default("Mint"),
  quantity: z.number().int().min(1).max(999).default(1),
})
  .and(serialNumberInputSchema);

const sessionItemIdInputSchema = z.object({
  id: z.number().int().positive(),
});

const updateSessionItemInputSchema = sessionItemIdInputSchema
  .extend({
  cardName: z.string().trim().min(1).max(160),
  setCode: z.string().trim().min(1).max(40),
  rarity: z.string().trim().min(1).max(80),
  edition: cardEditionSchema,
  language: z.string().trim().min(1).max(40),
  condition: cardConditionSchema,
  quantity: z.number().int().min(1).max(999),
  rarityConfirmed: z.boolean().default(false),
  printingIdentityTrusted: z.boolean().default(true),
})
  .and(serialNumberInputSchema);

const bulkConfirmRarityInputSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
});

const collectionSortSchema = z.enum([
  "cardName",
  "setCode",
  "condition",
  "quantity",
  "estimatedValue",
  "sessionCount",
]);

const collectionListInputSchema = z
  .object({
    includeArchived: z.boolean().default(false),
    query: z.string().trim().max(120).default(""),
    sortBy: collectionSortSchema.default("cardName"),
    sortDirection: z.enum(["asc", "desc"]).default("asc"),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(50).default(5),
  })
  .default({
    includeArchived: false,
    query: "",
    sortBy: "cardName",
    sortDirection: "asc",
    page: 1,
    pageSize: 5,
  });

type PriceSnapshot = typeof priceSnapshots.$inferSelect;

type SessionPricingSummary = {
  sessionEstimatedValue: string;
  pricedItemCount: number;
  unpricedItemCount: number;
  pricingIssueCount: number;
};

type Db = BetterSQLite3Database<typeof schema>;
type SessionItem = typeof sessionItems.$inferSelect;
type PricingSession = typeof pricingSessions.$inferSelect;

type CollectionProvenance = {
  sessionId: number;
  sessionName: string;
  sessionItemId: number;
  quantity: number;
};

type CollectionRow = {
  key: string;
  cardName: string;
  setCode: string;
  serialNumber: string;
  rarity: string;
  edition: string;
  language: string;
  condition: string;
  quantity: number;
  estimatedValue: string;
  pricedItemCount: number;
  unpricedItemCount: number;
  provenance: CollectionProvenance[];
};

type CollectionSummary = {
  collectionEstimatedValue: string;
  collectionRowCount: number;
  collectionItemCount: number;
  filteredRowCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  rows: CollectionRow[];
};

type CollectionListInput = z.infer<typeof collectionListInputSchema>;

type InternalCollectionRow = CollectionRow & {
  totalAmount: number;
  currency: string | null;
};

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

function formatCurrencyAmount(amount: number, currency: string | null) {
  if (!currency) {
    return amount.toFixed(2);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

function emptySessionPricingSummary(): SessionPricingSummary {
  return {
    sessionEstimatedValue: "$0.00",
    pricedItemCount: 0,
    unpricedItemCount: 0,
    pricingIssueCount: 0,
  };
}

function emptyCollectionSummary(): CollectionSummary {
  return {
    collectionEstimatedValue: "£0.00",
    collectionRowCount: 0,
    collectionItemCount: 0,
    filteredRowCount: 0,
    page: 1,
    pageSize: 5,
    totalPages: 1,
    rows: [],
  };
}

function latestSnapshotsByItemId(snapshots: PriceSnapshot[]) {
  const latest = new Map<number, PriceSnapshot>();

  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.sessionItemId);

    if (
      !current ||
      snapshot.observedAt.getTime() > current.observedAt.getTime() ||
      (snapshot.observedAt.getTime() === current.observedAt.getTime() &&
        snapshot.id > current.id)
    ) {
      latest.set(snapshot.sessionItemId, snapshot);
    }
  }

  return latest;
}

function calculatePricingSummary(
  items: SessionItem[],
  latestSnapshots: Map<number, PriceSnapshot>,
) {
  let total = 0;
  let currency: string | null = "USD";
  let pricedItemCount = 0;
  let unpricedItemCount = 0;
  let pricingIssueCount = 0;

  for (const item of items) {
    const snapshot = latestSnapshots.get(item.id);

    if (reviewReasonFor(item)) {
      unpricedItemCount += item.quantity;
      if (snapshot?.status === "pricing_unavailable") {
        pricingIssueCount += item.quantity;
      }
      continue;
    }

    if (
      snapshot?.status === "priced" &&
      snapshot.observedAmount &&
      snapshot.currency
    ) {
      const amount = Number(snapshot.observedAmount);

      if (Number.isFinite(amount)) {
        pricedItemCount += item.quantity;
        total += amount * item.quantity;
        currency = currency === snapshot.currency ? currency : null;
        continue;
      }
    }

    unpricedItemCount += item.quantity;

    if (snapshot?.status === "pricing_unavailable") {
      pricingIssueCount += item.quantity;
    }
  }

  return {
    sessionEstimatedValue: formatCurrencyAmount(total, currency),
    pricedItemCount,
    unpricedItemCount,
    pricingIssueCount,
  };
}

function hasTrustedPrintingIdentity(item: SessionItem) {
  return (
    item.printingIdentityTrusted &&
    item.cardName.trim().length > 0 &&
    item.setCode.trim().length > 0 &&
    item.passcode.trim().length > 0 &&
    item.rarity.trim().length > 0 &&
    item.edition.trim().length > 0 &&
    item.language.trim().length > 0
  );
}

function reviewReasonFor(item: SessionItem) {
  if (!hasTrustedPrintingIdentity(item)) {
    return "Identification Review" as const;
  }

  if (!item.rarityConfirmedAt) {
    return "Rarity Review" as const;
  }

  return null;
}

function reviewQuantityFor(items: SessionItem[]) {
  return items.reduce(
    (total, item) => total + (reviewReasonFor(item) ? item.quantity : 0),
    0,
  );
}

async function updateSessionReviewCount(db: Db, sessionId: number, now = new Date()) {
  const items = await db
    .select()
    .from(sessionItems)
    .where(eq(sessionItems.sessionId, sessionId));
  const reviewCount = reviewQuantityFor(items);

  await db
    .update(pricingSessions)
    .set({ reviewCount, updatedAt: now })
    .where(eq(pricingSessions.id, sessionId));

  return reviewCount;
}

async function pricingSummariesForSessions(
  db: Db,
  sessions: PricingSession[],
) {
  if (sessions.length === 0) {
    return new Map<number, SessionPricingSummary>();
  }

  const items = await db
    .select()
    .from(sessionItems)
    .where(
      inArray(
        sessionItems.sessionId,
        sessions.map((session) => session.id),
      ),
    );

  if (items.length === 0) {
    return new Map(
      sessions.map((session) => [session.id, emptySessionPricingSummary()]),
    );
  }

  const snapshots = await db
    .select()
    .from(priceSnapshots)
    .where(
      inArray(
        priceSnapshots.sessionItemId,
        items.map((item) => item.id),
      ),
    );
  const latestSnapshots = latestSnapshotsByItemId(snapshots);
  const summaries = new Map<number, SessionPricingSummary>();

  for (const session of sessions) {
    summaries.set(
      session.id,
      calculatePricingSummary(
        items.filter((item) => item.sessionId === session.id),
        latestSnapshots,
      ),
    );
  }

  return summaries;
}

function collectionKeyFor(item: SessionItem) {
  return [
    item.cardName,
    item.setCode,
    item.passcode,
    item.rarity,
    item.edition,
    item.language,
    item.condition,
  ].join("\u001f");
}

function serializeCollectionRow(
  item: SessionItem,
  latestSnapshot: PriceSnapshot | undefined,
  session: PricingSession,
): CollectionRow {
  let estimatedValue = "£0.00";
  let pricedItemCount = 0;
  let unpricedItemCount = item.quantity;

  if (
    latestSnapshot?.status === "priced" &&
    latestSnapshot.observedAmount &&
    latestSnapshot.currency
  ) {
    const amount = Number(latestSnapshot.observedAmount);

    if (Number.isFinite(amount)) {
      estimatedValue = formatCurrencyAmount(
        amount * item.quantity,
        latestSnapshot.currency,
      );
      pricedItemCount = item.quantity;
      unpricedItemCount = 0;
    }
  }

  return {
    key: collectionKeyFor(item),
    cardName: item.cardName,
    setCode: item.setCode,
    serialNumber: item.passcode,
    rarity: item.rarity,
    edition: item.edition,
    language: item.language,
    condition: item.condition,
    quantity: item.quantity,
    estimatedValue,
    pricedItemCount,
    unpricedItemCount,
    provenance: [
      {
        sessionId: session.id,
        sessionName: session.name,
        sessionItemId: item.id,
        quantity: item.quantity,
      },
    ],
  };
}

function aggregateCollectionRows(
  sessions: PricingSession[],
  items: SessionItem[],
  latestSnapshots: Map<number, PriceSnapshot>,
) {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const rows = new Map<string, InternalCollectionRow>();

  for (const item of items) {
    const session = sessionsById.get(item.sessionId);

    if (!session || reviewReasonFor(item)) {
      continue;
    }

    const key = collectionKeyFor(item);
    const latestSnapshot = latestSnapshots.get(item.id);
    const existing = rows.get(key);
    const snapshotAmount =
      latestSnapshot?.status === "priced" &&
      latestSnapshot.observedAmount &&
      latestSnapshot.currency
        ? Number(latestSnapshot.observedAmount)
        : null;
    const itemTotal =
      snapshotAmount !== null && Number.isFinite(snapshotAmount)
        ? snapshotAmount * item.quantity
        : null;
    const itemCurrency = itemTotal !== null ? latestSnapshot?.currency ?? null : null;

    if (!existing) {
      const row = serializeCollectionRow(item, latestSnapshot, session);
      rows.set(key, {
        ...row,
        totalAmount: itemTotal ?? 0,
        currency: itemCurrency ?? "USD",
      });
      continue;
    }

    existing.quantity += item.quantity;
    existing.pricedItemCount += itemTotal !== null ? item.quantity : 0;
    existing.unpricedItemCount += itemTotal !== null ? 0 : item.quantity;
    existing.totalAmount += itemTotal ?? 0;
    if (itemTotal !== null) {
      existing.currency =
        existing.currency === itemCurrency ? existing.currency : null;
    }
    existing.estimatedValue = formatCurrencyAmount(
      existing.totalAmount,
      existing.currency,
    );
    existing.provenance.push({
      sessionId: session.id,
      sessionName: session.name,
      sessionItemId: item.id,
      quantity: item.quantity,
    });
  }

  return Array.from(rows.values());
}

function collectionRowMatchesQuery(row: InternalCollectionRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [
    row.cardName,
    row.setCode,
    row.serialNumber,
    row.rarity,
    row.edition,
    row.language,
    row.condition,
    ...row.provenance.map((entry) => entry.sessionName),
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function compareCollectionRows(
  left: InternalCollectionRow,
  right: InternalCollectionRow,
  sortBy: CollectionListInput["sortBy"],
) {
  if (sortBy === "quantity") {
    return left.quantity - right.quantity;
  }

  if (sortBy === "estimatedValue") {
    return left.totalAmount - right.totalAmount;
  }

  if (sortBy === "sessionCount") {
    return left.provenance.length - right.provenance.length;
  }

  return left[sortBy].localeCompare(right[sortBy]);
}

function serializeCollectionRows(rows: InternalCollectionRow[]) {
  return rows.map(({ totalAmount: _totalAmount, currency: _currency, ...row }) => row);
}

async function collectionSummary(
  db: Db,
  options: CollectionListInput = collectionListInputSchema.parse(undefined),
): Promise<CollectionSummary> {
  const sessions = options.includeArchived
    ? await db.select().from(pricingSessions)
    : await db
        .select()
        .from(pricingSessions)
        .where(isNull(pricingSessions.archivedAt));

  if (sessions.length === 0) {
    return { ...emptyCollectionSummary(), pageSize: options.pageSize };
  }

  const items = await db
    .select()
    .from(sessionItems)
    .where(
      inArray(
        sessionItems.sessionId,
        sessions.map((session) => session.id),
      ),
    );

  if (items.length === 0) {
    return { ...emptyCollectionSummary(), pageSize: options.pageSize };
  }

  const snapshots = await db
    .select()
    .from(priceSnapshots)
    .where(
      inArray(
        priceSnapshots.sessionItemId,
        items.map((item) => item.id),
      ),
    );
  const latestSnapshots = latestSnapshotsByItemId(snapshots);
  const rows = aggregateCollectionRows(sessions, items, latestSnapshots);
  const filteredRows = rows
    .filter((row) => collectionRowMatchesQuery(row, options.query))
    .sort((left, right) => {
      const result = compareCollectionRows(left, right, options.sortBy);

      if (result !== 0) {
        return options.sortDirection === "asc" ? result : -result;
      }

      return left.cardName.localeCompare(right.cardName);
    });
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / options.pageSize));
  const page = Math.min(options.page, totalPages);
  const startIndex = (page - 1) * options.pageSize;
  const pageRows = filteredRows.slice(startIndex, startIndex + options.pageSize);
  let total = 0;
  let currency: string | null = "USD";

  for (const row of rows) {
    for (const provenance of row.provenance) {
      const snapshot = latestSnapshots.get(provenance.sessionItemId);

      if (
        snapshot?.status === "priced" &&
        snapshot.observedAmount &&
        snapshot.currency
      ) {
        const amount = Number(snapshot.observedAmount);

        if (Number.isFinite(amount)) {
          total += amount * provenance.quantity;
          currency = currency === snapshot.currency ? currency : null;
        }
      }
    }
  }

  return {
    collectionEstimatedValue:
      total > 0 ? formatCurrencyAmount(total, currency) : "£0.00",
    collectionRowCount: rows.length,
    collectionItemCount: rows.reduce((sum, row) => sum + row.quantity, 0),
    filteredRowCount: filteredRows.length,
    page,
    pageSize: options.pageSize,
    totalPages,
    rows: serializeCollectionRows(pageRows),
  };
}

function serializeSession(
  session: typeof pricingSessions.$inferSelect,
  pricingSummary: SessionPricingSummary = emptySessionPricingSummary(),
) {
  const joinUrl = joinUrlFor(session.joinCode);

  return {
    ...session,
    ...pricingSummary,
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

function serializePriceSnapshot(snapshot: PriceSnapshot | null) {
  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    observedAt: snapshot.observedAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
  };
}

function pricingIssueLabel(snapshot: PriceSnapshot | null) {
  if (!snapshot) {
    return "No price found" as const;
  }

  if (snapshot.status === "pricing_unavailable") {
    return "Pricing unavailable" as const;
  }

  if (snapshot.status === "no_price_found") {
    return "No price found" as const;
  }

  return null;
}

function serializeSessionItem(
  item: typeof sessionItems.$inferSelect,
  latestSnapshot: PriceSnapshot | null = null,
  cardImageUrl: string | null = null,
  cardType: string | null = null,
  frameType: string | null = null,
) {
  const reviewReason = reviewReasonFor(item);

  return {
    ...item,
    serialNumber: item.passcode,
    cardImageUrl,
    cardType,
    frameType,
    reviewReason,
    reviewStatus: reviewReason ? ("requires_review" as const) : ("success" as const),
    latestPriceSnapshot: serializePriceSnapshot(latestSnapshot),
    pricingIssue: pricingIssueLabel(latestSnapshot),
    rarityConfirmedAt: item.rarityConfirmedAt?.toISOString() ?? null,
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
  collection: router({
    list: publicProcedure
      .input(collectionListInputSchema)
      .query(async ({ ctx, input }) => collectionSummary(ctx.db, input)),
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
        const pricingSummaries = await pricingSummariesForSessions(
          ctx.db,
          sessions,
        );

        return sessions.map((session) =>
          serializeSession(session, pricingSummaries.get(session.id)),
        );
      }),
    get: publicProcedure
      .input(sessionIdInputSchema)
      .query(async ({ ctx, input }) => {
        const [session] = await ctx.db
          .select()
          .from(pricingSessions)
          .where(eq(pricingSessions.id, input.id));

        if (!session) {
          return null;
        }

        const pricingSummaries = await pricingSummariesForSessions(ctx.db, [
          session,
        ]);

        return serializeSession(session, pricingSummaries.get(session.id));
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
      const pricingSummaries = await pricingSummariesForSessions(
        ctx.db,
        activeSessions,
      );
      const collection = await collectionSummary(ctx.db);

      return {
        activeSessionCount: activeSessions.length,
        archivedSessionCount: allSessions.length - activeSessions.length,
        activeReviewCount: activeSessions.reduce(
          (total, session) => total + session.reviewCount,
          0,
        ),
        collectionEstimatedValue: collection.collectionEstimatedValue,
        collectionRowCount: collection.collectionRowCount,
        collectionItemCount: collection.collectionItemCount,
        continueSession: continueSession
          ? serializeSession(
              continueSession,
              pricingSummaries.get(continueSession.id),
            )
          : null,
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
        const itemRows = await ctx.db
          .select({
            item: sessionItems,
            cardImageUrl: cardMetadataCards.imageUrl,
            cardType: cardMetadataCards.cardType,
            frameType: cardMetadataCards.frameType,
          })
          .from(sessionItems)
          .leftJoin(
            cardMetadataCards,
            eq(sessionItems.passcode, cardMetadataCards.passcode),
          )
          .where(eq(sessionItems.sessionId, input.id))
          .orderBy(desc(sessionItems.createdAt));
        const items = itemRows.map((row) => row.item);
        const snapshots =
          items.length > 0
            ? await ctx.db
                .select()
                .from(priceSnapshots)
                .where(
                  inArray(
                    priceSnapshots.sessionItemId,
                    items.map((item) => item.id),
                  ),
                )
            : [];
        const latestSnapshots = latestSnapshotsByItemId(snapshots);

        return itemRows.map((row) =>
          serializeSessionItem(
            row.item,
            latestSnapshots.get(row.item.id) ?? null,
            row.cardImageUrl,
            row.cardType,
            row.frameType,
          ),
        );
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
            rarityConfirmedAt: null,
            printingIdentityTrusted: true,
            edition: input.edition,
            language: input.language,
            condition: input.condition,
            quantity: input.quantity,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await updateSessionReviewCount(ctx.db, input.id, now);

        const snapshot = await fetchAndStorePriceSnapshot(ctx.db, {
          id: item.id,
          passcode: item.passcode,
          setCode: item.setCode,
        });

        return serializeSessionItem(item, snapshot);
      }),
    updateItem: publicProcedure
      .input(updateSessionItemInputSchema)
      .mutation(async ({ ctx, input }) => {
        const [existingItem] = await ctx.db
          .select()
          .from(sessionItems)
          .where(eq(sessionItems.id, input.id));

        if (!existingItem) {
          return null;
        }

        const now = new Date();
        const rarityChanged = existingItem.rarity !== input.rarity;
        const [item] = await ctx.db
          .update(sessionItems)
          .set({
            cardName: input.cardName,
            setCode: input.setCode,
            passcode: input.passcode,
            rarity: input.rarity,
            rarityConfirmedAt:
              input.rarityConfirmed && !rarityChanged ? now : null,
            printingIdentityTrusted: input.printingIdentityTrusted,
            edition: input.edition,
            language: input.language,
            condition: input.condition,
            quantity: input.quantity,
            updatedAt: now,
          })
          .where(eq(sessionItems.id, input.id))
          .returning();

        await updateSessionReviewCount(ctx.db, item.sessionId, now);

        const snapshot = await fetchAndStorePriceSnapshot(ctx.db, {
          id: item.id,
          passcode: item.passcode,
          setCode: item.setCode,
        });

        return serializeSessionItem(item, snapshot);
      }),
    confirmItemRarity: publicProcedure
      .input(sessionItemIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const [existingItem] = await ctx.db
          .select()
          .from(sessionItems)
          .where(eq(sessionItems.id, input.id));

        if (!existingItem || !hasTrustedPrintingIdentity(existingItem)) {
          return null;
        }

        const now = new Date();
        const [item] = await ctx.db
          .update(sessionItems)
          .set({ rarityConfirmedAt: now, updatedAt: now })
          .where(eq(sessionItems.id, input.id))
          .returning();

        await updateSessionReviewCount(ctx.db, item.sessionId, now);

        return serializeSessionItem(item);
      }),
    bulkConfirmRarity: publicProcedure
      .input(bulkConfirmRarityInputSchema)
      .mutation(async ({ ctx, input }) => {
        const uniqueIds = Array.from(new Set(input.ids));
        const items = await ctx.db
          .select()
          .from(sessionItems)
          .where(inArray(sessionItems.id, uniqueIds));

        if (items.length !== uniqueIds.length || items.length === 0) {
          return { updatedCount: 0, rejected: true };
        }

        const firstItem = items[0]!;
        const allSimilar = items.every(
          (item) =>
            item.sessionId === firstItem.sessionId &&
            reviewReasonFor(item) === "Rarity Review" &&
            item.cardName === firstItem.cardName &&
            item.setCode === firstItem.setCode &&
            item.passcode === firstItem.passcode &&
            item.rarity === firstItem.rarity &&
            item.edition === firstItem.edition &&
            item.language === firstItem.language,
        );

        if (!allSimilar) {
          return { updatedCount: 0, rejected: true };
        }

        const now = new Date();
        const updatedItems = await ctx.db
          .update(sessionItems)
          .set({ rarityConfirmedAt: now, updatedAt: now })
          .where(inArray(sessionItems.id, uniqueIds))
          .returning();

        await updateSessionReviewCount(ctx.db, firstItem.sessionId, now);

        return { updatedCount: updatedItems.length, rejected: false };
      }),
    refreshItemPricing: publicProcedure
      .input(sessionItemIdInputSchema)
      .mutation(async ({ ctx, input }) => {
        const [item] = await ctx.db
          .select()
          .from(sessionItems)
          .where(eq(sessionItems.id, input.id));

        if (!item) {
          return null;
        }

        const snapshot = await fetchAndStorePriceSnapshot(ctx.db, {
          id: item.id,
          passcode: item.passcode,
          setCode: item.setCode,
        });

        await ctx.db
          .update(sessionItems)
          .set({ updatedAt: new Date() })
          .where(eq(sessionItems.id, item.id));

        return serializeSessionItem(
          {
            ...item,
            updatedAt: new Date(),
          },
          snapshot,
        );
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
