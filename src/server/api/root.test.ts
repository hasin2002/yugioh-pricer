import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { appRouter } from "@/server/api/root";
import * as schema from "@/server/db/schema";

function createTestCaller() {
  const sqlite = new Database(":memory:");

  sqlite.exec(`
    CREATE TABLE pricing_sessions (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL,
      join_code text NOT NULL UNIQUE,
      active_capture_client_id text,
      active_capture_client_joined_at integer,
      archived_at integer,
      review_count integer DEFAULT 0 NOT NULL,
      created_at integer DEFAULT (unixepoch()) NOT NULL,
      updated_at integer DEFAULT (unixepoch()) NOT NULL
    );

    CREATE TABLE app_meta (
      key text PRIMARY KEY NOT NULL,
      value text NOT NULL,
      updated_at integer DEFAULT (unixepoch()) NOT NULL
    );

    CREATE TABLE card_metadata_cards (
      passcode text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      normalized_name text NOT NULL,
      card_type text NOT NULL,
      frame_type text,
      description text,
      race text,
      attribute text,
      image_url text,
      updated_at integer DEFAULT (unixepoch()) NOT NULL
    );

    CREATE TABLE card_metadata_printings (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      passcode text NOT NULL REFERENCES card_metadata_cards(passcode) ON DELETE cascade,
      set_name text NOT NULL,
      set_code text NOT NULL UNIQUE,
      rarity text,
      rarity_code text,
      source_set_price text,
      updated_at integer DEFAULT (unixepoch()) NOT NULL
    );

    CREATE TABLE best_frames (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      storage_path text NOT NULL,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      created_at integer DEFAULT (unixepoch()) NOT NULL
    );

    CREATE TABLE session_items (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_id integer NOT NULL REFERENCES pricing_sessions(id) ON DELETE cascade,
      best_frame_id integer REFERENCES best_frames(id) ON DELETE set null,
      entry_source text NOT NULL,
      card_name text NOT NULL,
      set_code text NOT NULL,
      passcode text NOT NULL,
      rarity text NOT NULL,
      rarity_confirmed_at integer,
      printing_identity_trusted integer DEFAULT 0 NOT NULL,
      edition text NOT NULL,
      language text NOT NULL,
      condition text NOT NULL,
      quantity integer NOT NULL,
      created_at integer DEFAULT (unixepoch()) NOT NULL,
      updated_at integer DEFAULT (unixepoch()) NOT NULL
    );

    CREATE TABLE price_snapshots (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_item_id integer NOT NULL REFERENCES session_items(id) ON DELETE cascade,
      status text NOT NULL,
      observed_amount text,
      source text NOT NULL,
      currency text,
      observed_at integer NOT NULL,
      created_at integer DEFAULT (unixepoch()) NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });

  return {
    caller: appRouter.createCaller({ db }),
    db,
    close: () => sqlite.close(),
  };
}

function mockYgoPriceResponse(
  payload: unknown,
  init: {
    status?: number;
  } = {},
) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify(payload), {
      status: init.status ?? 200,
    });

  return () => {
    globalThis.fetch = originalFetch;
  };
}

describe("appRouter", () => {
  const originalPhoneSafeOrigin = process.env.PHONE_SAFE_HTTPS_ORIGIN;

  afterEach(() => {
    if (originalPhoneSafeOrigin === undefined) {
      delete process.env.PHONE_SAFE_HTTPS_ORIGIN;
    } else {
      process.env.PHONE_SAFE_HTTPS_ORIGIN = originalPhoneSafeOrigin;
    }
  });

  it("responds on the typed health path", async () => {
    const { caller, close } = createTestCaller();

    try {
      await expect(caller.app.health({ client: "review" })).resolves.toEqual({
        ok: true,
        client: "review",
        message: "Typed API path ready",
      });
    } finally {
      close();
    }
  });

  it("refreshes and searches card metadata without satisfying pricing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 46986414,
              name: "Dark Magician",
              type: "Normal Monster",
              frameType: "normal",
              card_sets: [
                {
                  set_name: "Legend of Blue Eyes White Dragon",
                  set_code: "LOB-005",
                  set_rarity: "Ultra Rare",
                },
              ],
            },
          ],
        }),
      );
    const { caller, close } = createTestCaller();

    try {
      const status = await caller.cards.refreshMetadata();
      const results = await caller.cards.searchMetadata({ query: "LOB-005" });

      expect(status.cardCount).toBe(1);
      expect(status.printingCount).toBe(1);
      expect(results).toEqual([
        expect.objectContaining({
          name: "Dark Magician",
          passcode: "46986414",
          setCode: "LOB-005",
          metadataOnly: true,
          pricingStatus: "requires_pricing",
        }),
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      close();
    }
  });

  it("creates and renames durable pricing sessions", async () => {
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();

      expect(session.name).toMatch(/^Pricing Session /);
      expect(session.reviewCount).toBe(0);

      const renamed = await caller.sessions.rename({
        id: session.id,
        name: "Binder Review",
      });
      const sessions = await caller.sessions.list();

      expect(renamed?.name).toBe("Binder Review");
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.name).toBe("Binder Review");
    } finally {
      close();
    }
  });

  it("adds manual items to a pricing session without a best frame", async () => {
    const restoreFetch = mockYgoPriceResponse({
      data: [
        {
          id: 46986414,
          card_sets: [
            {
              set_code: "LOB-005",
              set_price: "12.34",
            },
          ],
        },
      ],
    });
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const item = await caller.sessions.addManualItem({
        id: session.id,
        cardName: "Dark Magician",
        setCode: "LOB-005",
        passcode: "46986414",
        rarity: "Ultra Rare",
        edition: "Limited Edition",
        language: "English",
        condition: "Near Mint",
        quantity: 2,
      });
      const items = await caller.sessions.items({ id: session.id });
      const sessions = await caller.sessions.list();
      const summary = await caller.sessions.summary();

      expect(item).toMatchObject({
        sessionId: session.id,
        bestFrameId: null,
        entrySource: "manual",
        cardName: "Dark Magician",
        setCode: "LOB-005",
        passcode: "46986414",
        rarity: "Ultra Rare",
        edition: "Limited Edition",
        language: "English",
        condition: "Near Mint",
        quantity: 2,
        reviewReason: "Rarity Review",
        reviewStatus: "requires_review",
      });
      expect(item.latestPriceSnapshot).toMatchObject({
        status: "priced",
        observedAmount: "12.34",
        source: "ygoprodeck.card_sets.set_price",
        currency: "USD",
      });
      expect(items).toHaveLength(1);
      expect(items[0]?.latestPriceSnapshot?.observedAmount).toBe("12.34");
      expect(sessions[0]?.reviewCount).toBe(2);
      expect(sessions[0]?.sessionEstimatedValue).toBe("$0.00");
      expect(summary.collectionEstimatedValue).toBe("£0.00");
    } finally {
      restoreFetch();
      close();
    }
  });

  it("promotes rarity-confirmed items to successfully scanned", async () => {
    const restoreFetch = mockYgoPriceResponse({
      data: [
        {
          id: 46986414,
          card_sets: [
            {
              set_code: "LOB-005",
              set_price: "12.34",
            },
          ],
        },
      ],
    });
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const item = await caller.sessions.addManualItem({
        id: session.id,
        cardName: "Dark Magician",
        setCode: "LOB-005",
        passcode: "46986414",
        rarity: "Ultra Rare",
      });

      const confirmed = await caller.sessions.confirmItemRarity({ id: item.id });
      const items = await caller.sessions.items({ id: session.id });
      const [listedSession] = await caller.sessions.list();

      expect(confirmed?.reviewReason).toBeNull();
      expect(confirmed?.reviewStatus).toBe("success");
      expect(confirmed?.rarityConfirmedAt).not.toBeNull();
      expect(items[0]?.reviewStatus).toBe("success");
      expect(listedSession?.reviewCount).toBe(0);
      expect(listedSession?.sessionEstimatedValue).toBe("$12.34");
    } finally {
      restoreFetch();
      close();
    }
  });

  it("keeps untrusted printing identities in identification review until corrected", async () => {
    const restoreFetch = mockYgoPriceResponse({
      data: [{ id: 46986414, card_sets: [{ set_code: "LOB-005" }] }],
    });
    const { caller, db, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const [item] = await db
        .insert(schema.sessionItems)
        .values({
          sessionId: session.id,
          entrySource: "capture",
          cardName: "Dark Magician",
          setCode: "LOB-005",
          passcode: "46986414",
          rarity: "Ultra Rare",
          printingIdentityTrusted: false,
          edition: "1st Edition",
          language: "English",
          condition: "Mint",
          quantity: 1,
        })
        .returning();
      await caller.sessions.updateItem({
        id: item.id,
        cardName: "Dark Magician",
        setCode: "LOB-005",
        passcode: "46986414",
        rarity: "Ultra Rare",
        edition: "1st Edition",
        language: "English",
        condition: "Mint",
        quantity: 1,
        printingIdentityTrusted: true,
        rarityConfirmed: false,
      });

      const [reviewItem] = await caller.sessions.items({ id: session.id });

      expect(reviewItem?.reviewReason).toBe("Rarity Review");
    } finally {
      restoreFetch();
      close();
    }
  });

  it("bulk confirms only selected similar rarity-review items", async () => {
    const { caller, db, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const insertedItems = await db
        .insert(schema.sessionItems)
        .values([
          {
            sessionId: session.id,
            entrySource: "manual",
            cardName: "Dark Magician",
            setCode: "LOB-005",
            passcode: "46986414",
            rarity: "Ultra Rare",
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Mint",
            quantity: 1,
          },
          {
            sessionId: session.id,
            entrySource: "manual",
            cardName: "Dark Magician",
            setCode: "LOB-005",
            passcode: "46986414",
            rarity: "Ultra Rare",
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Near Mint",
            quantity: 2,
          },
        ])
        .returning();

      const result = await caller.sessions.bulkConfirmRarity({
        ids: insertedItems.map((item) => item.id),
      });
      const items = await caller.sessions.items({ id: session.id });
      const [listedSession] = await caller.sessions.list();

      expect(result).toEqual({ updatedCount: 2, rejected: false });
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ reviewStatus: "success" }),
          expect.objectContaining({ reviewStatus: "success" }),
        ]),
      );
      expect(listedSession?.reviewCount).toBe(0);
    } finally {
      close();
    }
  });

  it("uses manual item defaults for printing identity fields", async () => {
    const restoreFetch = mockYgoPriceResponse({ data: [{ id: 89631139 }] });
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const item = await caller.sessions.addManualItem({
        id: session.id,
        cardName: "Blue-Eyes White Dragon",
        setCode: "SDK-001",
        passcode: "89631139",
        rarity: "Ultra Rare",
      });

      expect(item).toMatchObject({
        edition: "1st Edition",
        language: "English",
        condition: "Mint",
        quantity: 1,
      });
      expect(item.latestPriceSnapshot?.status).toBe("no_price_found");
      expect(item.pricingIssue).toBe("No price found");
    } finally {
      restoreFetch();
      close();
    }
  });

  it("stores pricing unavailable as a distinct pricing issue", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const item = await caller.sessions.addManualItem({
        id: session.id,
        cardName: "Dark Magician",
        setCode: "LOB-005",
        passcode: "46986414",
        rarity: "Ultra Rare",
      });
      const sessions = await caller.sessions.list();

      expect(item.latestPriceSnapshot).toMatchObject({
        status: "pricing_unavailable",
        observedAmount: null,
        source: "ygoprodeck",
        currency: null,
      });
      expect(item.pricingIssue).toBe("Pricing unavailable");
      expect(sessions[0]?.sessionEstimatedValue).toBe("$0.00");
      expect(sessions[0]?.unpricedItemCount).toBe(1);
      expect(sessions[0]?.pricingIssueCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
      close();
    }
  });

  it("refreshes item pricing with a fresh YGOPRODeck lookup", async () => {
    let price = "1.00";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 46986414,
              card_sets: [
                {
                  set_code: "LOB-005",
                  set_price: price,
                },
              ],
            },
          ],
        }),
      );
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const item = await caller.sessions.addManualItem({
        id: session.id,
        cardName: "Dark Magician",
        setCode: "LOB-005",
        passcode: "46986414",
        rarity: "Ultra Rare",
      });

      price = "2.50";
      const refreshed = await caller.sessions.refreshItemPricing({ id: item.id });
      const items = await caller.sessions.items({ id: session.id });

      expect(refreshed?.latestPriceSnapshot?.observedAmount).toBe("2.50");
      expect(items[0]?.latestPriceSnapshot?.observedAmount).toBe("2.50");
    } finally {
      globalThis.fetch = originalFetch;
      close();
    }
  });

  it("excludes unpriced review items from session estimated value", async () => {
    const { caller, db, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const [pricedItem] = await db
        .insert(schema.sessionItems)
        .values({
          sessionId: session.id,
          entrySource: "manual",
          cardName: "Dark Magician",
          setCode: "LOB-005",
          passcode: "46986414",
          rarity: "Ultra Rare",
          rarityConfirmedAt: new Date(),
          printingIdentityTrusted: true,
          edition: "1st Edition",
          language: "English",
          condition: "Mint",
          quantity: 2,
        })
        .returning();
      await db.insert(schema.sessionItems).values({
        sessionId: session.id,
        entrySource: "manual",
        cardName: "Blue-Eyes White Dragon",
        setCode: "SDK-001",
        passcode: "89631139",
        rarity: "Ultra Rare",
        edition: "1st Edition",
        language: "English",
        condition: "Mint",
        quantity: 3,
      });
      await db.insert(schema.priceSnapshots).values({
        sessionItemId: pricedItem.id,
        status: "priced",
        observedAmount: "5.00",
        source: "ygoprodeck.card_sets.set_price",
        currency: "USD",
        observedAt: new Date(),
      });

      const [listedSession] = await caller.sessions.list();
      const items = await caller.sessions.items({ id: session.id });

      expect(listedSession?.sessionEstimatedValue).toBe("$10.00");
      expect(listedSession?.pricedItemCount).toBe(2);
      expect(listedSession?.unpricedItemCount).toBe(3);
      expect(
        items.find((item) => item.cardName === "Blue-Eyes White Dragon")
          ?.pricingIssue,
      ).toBe("No price found");
    } finally {
      close();
    }
  });

  it("excludes archived sessions from default lists and summary counts", async () => {
    const { caller, db, close } = createTestCaller();

    try {
      const [activeSession] = await db
        .insert(schema.pricingSessions)
        .values({
          name: "Active Review",
          joinCode: "ACTIVE01",
          reviewCount: 3,
        })
        .returning();
      const [archivedSession] = await db
        .insert(schema.pricingSessions)
        .values({
          name: "Archived Review",
          joinCode: "ARCHIVED01",
          reviewCount: 8,
          archivedAt: new Date(),
        })
        .returning();

      const defaultSessions = await caller.sessions.list();
      const allSessions = await caller.sessions.list({ includeArchived: true });
      const summary = await caller.sessions.summary();

      expect(defaultSessions.map((session) => session.id)).toEqual([
        activeSession.id,
      ]);
      expect(allSessions.map((session) => session.id).sort()).toEqual(
        [activeSession.id, archivedSession.id].sort(),
      );
      expect(summary.activeSessionCount).toBe(1);
      expect(summary.archivedSessionCount).toBe(1);
      expect(summary.activeReviewCount).toBe(3);
      expect(summary.collectionEstimatedValue).toBe("£0.00");
      expect(summary.continueSession?.id).toBe(activeSession.id);
    } finally {
      close();
    }
  });

  it("unarchives and deletes pricing sessions", async () => {
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const archived = await caller.sessions.archive({ id: session.id });

      expect(archived?.archivedAt).not.toBeNull();
      await expect(caller.sessions.list()).resolves.toEqual([]);

      const unarchived = await caller.sessions.unarchive({ id: session.id });

      expect(unarchived?.archivedAt).toBeNull();
      await expect(caller.sessions.list()).resolves.toHaveLength(1);

      await expect(caller.sessions.delete({ id: session.id })).resolves.toEqual({
        deleted: true,
      });
      await expect(caller.sessions.list({ includeArchived: true })).resolves.toEqual(
        [],
      );
    } finally {
      close();
    }
  });

  it("exposes HTTPS join links and QR codes when the phone-safe origin is configured", async () => {
    process.env.PHONE_SAFE_HTTPS_ORIGIN = "https://capture.example.test/path";
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();

      expect(session.joinCode).toMatch(/^[A-Z0-9_-]+$/);
      expect(session.joinUrl).toBe(
        `https://capture.example.test/capture?join=${session.joinCode}`,
      );
      expect(session.joinQrSvg).toContain("<svg");
      expect(session.phoneSafeOriginConfigured).toBe(true);
    } finally {
      close();
    }
  });

  it("warns callers when no HTTPS phone-safe origin is configured", async () => {
    delete process.env.PHONE_SAFE_HTTPS_ORIGIN;
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();

      expect(session.joinUrl).toBeNull();
      expect(session.joinQrSvg).toBeNull();
      expect(session.phoneSafeOriginConfigured).toBe(false);
    } finally {
      close();
    }
  });

  it("binds a join code to one pricing session and one active capture client", async () => {
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const firstJoin = await caller.capture.join({
        joinCode: session.joinCode,
        clientId: "client-one",
      });

      expect(firstJoin.status).toBe("joined");
      expect(firstJoin.session?.id).toBe(session.id);
      expect(firstJoin.activeCaptureClientId).toBe("client-one");

      const rejectedJoin = await caller.capture.join({
        joinCode: session.joinCode,
        clientId: "client-two",
      });

      expect(rejectedJoin.status).toBe("already_claimed");
      expect(rejectedJoin.session?.id).toBe(session.id);
      expect(rejectedJoin.activeCaptureClientId).toBe("client-one");

      const replacementJoin = await caller.capture.join({
        joinCode: session.joinCode,
        clientId: "client-two",
        replaceExisting: true,
      });

      expect(replacementJoin.status).toBe("joined");
      expect(replacementJoin.activeCaptureClientId).toBe("client-two");
    } finally {
      close();
    }
  });

  it("returns archived session state when a capture client joins", async () => {
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      await caller.sessions.archive({ id: session.id });

      const joined = await caller.capture.join({
        joinCode: session.joinCode,
        clientId: "archived-client",
      });

      expect(joined.status).toBe("joined");
      expect(joined.session?.archivedAt).not.toBeNull();
    } finally {
      close();
    }
  });
});
