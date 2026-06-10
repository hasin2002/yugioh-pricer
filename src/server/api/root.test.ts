import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { appRouter } from "@/server/api/root";
import * as schema from "@/server/db/schema";
import {
  sessionEventBus,
  type SessionEvent,
} from "@/server/session-events";

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
      capture_fingerprint text,
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

    CREATE TABLE capture_candidate_frames (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_item_id integer NOT NULL REFERENCES session_items(id) ON DELETE cascade,
      position integer NOT NULL,
      selected_as_best integer DEFAULT 0 NOT NULL,
      mime_type text NOT NULL,
      size_bytes integer NOT NULL,
      card_like integer,
      brightness integer,
      signature text,
      created_at integer DEFAULT (unixepoch()) NOT NULL
    );

    CREATE TABLE ocr_evidence (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      session_item_id integer NOT NULL REFERENCES session_items(id) ON DELETE cascade,
      status text DEFAULT 'pending' NOT NULL,
      raw_text text,
      card_name_text text,
      card_name_confidence integer,
      set_code_text text,
      set_code_confidence integer,
      edition_text text,
      edition_confidence integer,
      serial_number_text text,
      serial_number_confidence integer,
      source_regions text,
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
    caller: appRouter.createCaller({ db, requestOrigin: null }),
    db,
    close: () => sqlite.close(),
  };
}

function createTestCallerForOrigin(requestOrigin: string) {
  const testContext = createTestCaller();

  return {
    ...testContext,
    caller: appRouter.createCaller({
      db: testContext.db,
      requestOrigin,
    }),
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
        serialNumber: "46986414",
        rarity: "Ultra Rare",
        edition: "Limited Edition",
        language: "English",
        condition: "Near Mint",
        quantity: 2,
        reviewReason: "Rarity Review",
        reviewStatus: "requires_review",
        scanEvidence: {
          bestFrame: null,
          candidateFrames: [],
          ocrEvidence: null,
        },
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

  it("gets one session with workspace summary and QR metadata", async () => {
    process.env.PHONE_SAFE_HTTPS_ORIGIN = "https://capture.example.test";
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const workspaceSession = await caller.sessions.get({ id: session.id });

      expect(workspaceSession).toMatchObject({
        id: session.id,
        name: session.name,
        sessionEstimatedValue: "$0.00",
        reviewCount: 0,
        joinUrl: `https://capture.example.test/capture?join=${session.joinCode}`,
        phoneSafeOriginConfigured: true,
      });
      expect(workspaceSession?.joinQrSvg).toContain("<svg");
      await expect(caller.sessions.get({ id: 999 })).resolves.toBeNull();
    } finally {
      close();
    }
  });

  it("uses the public HTTPS request origin for capture QR links", async () => {
    const { caller, close } = createTestCallerForOrigin(
      "https://discuss-nuclear-font-tab.trycloudflare.com",
    );

    try {
      const session = await caller.sessions.create();
      const workspaceSession = await caller.sessions.get({ id: session.id });

      expect(workspaceSession?.joinUrl).toBe(
        `https://discuss-nuclear-font-tab.trycloudflare.com/capture?join=${session.joinCode}`,
      );
      expect(workspaceSession?.joinQrSvg).toContain("<svg");
      expect(workspaceSession?.phoneSafeOriginConfigured).toBe(true);
    } finally {
      close();
    }
  });

  it("accepts Serial Number as the item input name", async () => {
    const restoreFetch = mockYgoPriceResponse({ data: [{ id: 46986414 }] });
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const item = await caller.sessions.addManualItem({
        id: session.id,
        cardName: "Dark Magician",
        setCode: "LOB-005",
        serialNumber: "46986414",
        rarity: "Ultra Rare",
      });

      expect(item).toMatchObject({
        passcode: "46986414",
        serialNumber: "46986414",
      });
    } finally {
      restoreFetch();
      close();
    }
  });

  it("returns card metadata art for session workspace items", async () => {
    const { caller, db, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      await db.insert(schema.cardMetadataCards).values({
        passcode: "46986414",
        name: "Dark Magician",
        normalizedName: "dark magician",
        cardType: "Normal Monster",
        frameType: "normal",
        imageUrl: "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
      });
      await db.insert(schema.sessionItems).values({
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
      });

      const [item] = await caller.sessions.items({ id: session.id });

      expect(item?.cardImageUrl).toBe(
        "https://images.ygoprodeck.com/images/cards_small/46986414.jpg",
      );
      expect(item?.cardType).toBe("Normal Monster");
      expect(item?.frameType).toBe("normal");
    } finally {
      close();
    }
  });

  it("returns scan evidence for captured workspace items", async () => {
    const { caller, db, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const [bestFrame] = await db
        .insert(schema.bestFrames)
        .values({
          storagePath: "data/best-frames/test-frame.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1234,
        })
        .returning();
      const [item] = await db
        .insert(schema.sessionItems)
        .values({
          sessionId: session.id,
          bestFrameId: bestFrame.id,
          captureFingerprint: "capture-1",
          entrySource: "capture",
          cardName: "Captured card",
          setCode: "Unknown",
          passcode: "Unknown",
          rarity: "Unknown",
          printingIdentityTrusted: false,
          edition: "1st Edition",
          language: "English",
          condition: "Mint",
          quantity: 1,
        })
        .returning();
      await db.insert(schema.captureCandidateFrames).values([
        {
          sessionItemId: item.id,
          position: 2,
          selectedAsBest: true,
          mimeType: "image/jpeg",
          sizeBytes: 1234,
          cardLike: true,
          brightness: 91,
          signature: "abcd",
        },
        {
          sessionItemId: item.id,
          position: 1,
          selectedAsBest: false,
          mimeType: "image/jpeg",
          sizeBytes: 900,
          cardLike: false,
          brightness: 75,
          signature: "abce",
        },
      ]);
      await db.insert(schema.ocrEvidence).values({
        sessionItemId: item.id,
        status: "pending",
        sourceRegions: "{\"regions\":[]}",
      });

      const [workspaceItem] = await caller.sessions.items({ id: session.id });

      expect(workspaceItem?.scanEvidence.bestFrame).toMatchObject({
        id: bestFrame.id,
        url: `/api/capture/best-frame/${bestFrame.id}`,
        storagePath: "data/best-frames/test-frame.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1234,
      });
      expect(
        workspaceItem?.scanEvidence.candidateFrames.map((frame) => ({
          position: frame.position,
          selectedAsBest: frame.selectedAsBest,
          cardLike: frame.cardLike,
          brightness: frame.brightness,
          signature: frame.signature,
        })),
      ).toEqual([
        {
          position: 1,
          selectedAsBest: false,
          cardLike: false,
          brightness: 75,
          signature: "abce",
        },
        {
          position: 2,
          selectedAsBest: true,
          cardLike: true,
          brightness: 91,
          signature: "abcd",
        },
      ]);
      expect(workspaceItem?.scanEvidence.ocrEvidence).toMatchObject({
        status: "pending",
        cardNameText: null,
        setCodeText: null,
        editionText: null,
        serialNumberText: null,
        sourceRegions: "{\"regions\":[]}",
      });
    } finally {
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

  it("clears Rarity Confirmation when rarity is edited", async () => {
    const restoreFetch = mockYgoPriceResponse({
      data: [{ id: 46986414, card_sets: [{ set_code: "LOB-005" }] }],
    });
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const item = await caller.sessions.addManualItem({
        id: session.id,
        cardName: "Dark Magician",
        setCode: "LOB-005",
        serialNumber: "46986414",
        rarity: "Ultra Rare",
      });
      await caller.sessions.confirmItemRarity({ id: item.id });

      const updated = await caller.sessions.updateItem({
        id: item.id,
        cardName: "Dark Magician",
        setCode: "LOB-005",
        serialNumber: "46986414",
        rarity: "Secret Rare",
        edition: "1st Edition",
        language: "English",
        condition: "Mint",
        quantity: 1,
        printingIdentityTrusted: true,
        rarityConfirmed: true,
      });

      expect(updated?.rarity).toBe("Secret Rare");
      expect(updated?.rarityConfirmedAt).toBeNull();
      expect(updated?.reviewReason).toBe("Rarity Review");
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

  it("adjusts captured item quantity and never decrements below one", async () => {
    const { caller, db, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const [item] = await db
        .insert(schema.sessionItems)
        .values({
          sessionId: session.id,
          captureFingerprint: "fingerprint-1",
          entrySource: "capture",
          cardName: "Captured card",
          setCode: "Unknown",
          passcode: "Unknown",
          rarity: "Unknown",
          printingIdentityTrusted: false,
          edition: "1st Edition",
          language: "English",
          condition: "Mint",
          quantity: 1,
        })
        .returning();

      const incremented = await caller.sessions.adjustItemQuantity({
        id: item.id,
        delta: 1,
      });
      const decremented = await caller.sessions.adjustItemQuantity({
        id: item.id,
        delta: -1,
      });
      const floored = await caller.sessions.adjustItemQuantity({
        id: item.id,
        delta: -1,
      });

      expect(incremented?.quantity).toBe(2);
      expect(decremented?.quantity).toBe(1);
      expect(floored?.quantity).toBe(1);
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

  it("publishes session events for item, review, quantity, and price changes", async () => {
    const events: SessionEvent[] = [];
    const unsubscribe = sessionEventBus.subscribe((event) => events.push(event));
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
      await caller.sessions.updateItem({
        id: item.id,
        cardName: "Dark Magician",
        setCode: "LOB-005",
        passcode: "46986414",
        rarity: "Ultra Rare",
        edition: "1st Edition",
        language: "English",
        condition: "Mint",
        quantity: 2,
        printingIdentityTrusted: true,
        rarityConfirmed: false,
      });
      await caller.sessions.confirmItemRarity({ id: item.id });
      price = "2.50";
      await caller.sessions.refreshItemPricing({ id: item.id });

      expect(
        events
          .filter((event) => event.sessionId === session.id)
          .map((event) => event.type),
      ).toEqual(
        expect.arrayContaining([
          "session_status_changed",
          "item_created",
          "item_updated",
          "quantity_changed",
          "review_changed",
          "price_changed",
        ]),
      );
    } finally {
      unsubscribe();
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

  it("derives active collection rows from successful session items with provenance", async () => {
    const { caller, db, close } = createTestCaller();

    try {
      const [firstSession, secondSession, archivedSession] = await db
        .insert(schema.pricingSessions)
        .values([
          { name: "Binder One", joinCode: "BINDER01" },
          { name: "Binder Two", joinCode: "BINDER02" },
          {
            name: "Archived Test",
            joinCode: "ARCHIVE02",
            archivedAt: new Date(),
          },
        ])
        .returning();
      const now = new Date();
      const insertedItems = await db
        .insert(schema.sessionItems)
        .values([
          {
            sessionId: firstSession.id,
            entrySource: "manual",
            cardName: "Dark Magician",
            setCode: "LOB-005",
            passcode: "46986414",
            rarity: "Ultra Rare",
            rarityConfirmedAt: now,
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Near Mint",
            quantity: 2,
          },
          {
            sessionId: secondSession.id,
            entrySource: "manual",
            cardName: "Dark Magician",
            setCode: "LOB-005",
            passcode: "46986414",
            rarity: "Ultra Rare",
            rarityConfirmedAt: now,
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Near Mint",
            quantity: 1,
          },
          {
            sessionId: secondSession.id,
            entrySource: "manual",
            cardName: "Dark Magician",
            setCode: "LOB-005",
            passcode: "46986414",
            rarity: "Ultra Rare",
            rarityConfirmedAt: now,
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Played",
            quantity: 4,
          },
          {
            sessionId: firstSession.id,
            entrySource: "manual",
            cardName: "Blue-Eyes White Dragon",
            setCode: "SDK-001",
            passcode: "89631139",
            rarity: "Ultra Rare",
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Mint",
            quantity: 3,
          },
          {
            sessionId: archivedSession.id,
            entrySource: "manual",
            cardName: "Red-Eyes B. Dragon",
            setCode: "LOB-070",
            passcode: "74677422",
            rarity: "Ultra Rare",
            rarityConfirmedAt: now,
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Mint",
            quantity: 5,
          },
        ])
        .returning();

      await db.insert(schema.priceSnapshots).values(
        insertedItems.map((item) => ({
          sessionItemId: item.id,
          status: "priced",
          observedAmount: item.cardName === "Red-Eyes B. Dragon" ? "7.00" : "5.00",
          source: "ygoprodeck.card_sets.set_price",
          currency: "USD",
          observedAt: now,
        })),
      );

      const collection = await caller.collection.list();
      const summary = await caller.sessions.summary();
      const archivedWorkspace = await caller.sessions.get({
        id: archivedSession.id,
      });

      expect(collection.collectionEstimatedValue).toBe("$35.00");
      expect(collection.collectionRowCount).toBe(2);
      expect(collection.collectionItemCount).toBe(7);
      expect(summary.collectionEstimatedValue).toBe("$35.00");
      expect(summary.collectionRowCount).toBe(2);
      expect(summary.collectionItemCount).toBe(7);
      expect(archivedWorkspace?.sessionEstimatedValue).toBe("$35.00");
      expect(collection.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            cardName: "Dark Magician",
            condition: "Near Mint",
            quantity: 3,
            estimatedValue: "$15.00",
            provenance: expect.arrayContaining([
              expect.objectContaining({
                sessionId: firstSession.id,
                sessionName: "Binder One",
                quantity: 2,
              }),
              expect.objectContaining({
                sessionId: secondSession.id,
                sessionName: "Binder Two",
                quantity: 1,
              }),
            ]),
          }),
          expect.objectContaining({
            cardName: "Dark Magician",
            condition: "Played",
            quantity: 4,
            estimatedValue: "$20.00",
          }),
        ]),
      );
      expect(
        collection.rows.some((row) => row.cardName === "Blue-Eyes White Dragon"),
      ).toBe(false);
      expect(
        collection.rows.some((row) => row.cardName === "Red-Eyes B. Dragon"),
      ).toBe(false);
    } finally {
      close();
    }
  });

  it("paginates, filters, and sorts active collection rows", async () => {
    const { caller, db, close } = createTestCaller();

    try {
      const [session] = await db
        .insert(schema.pricingSessions)
        .values({ name: "Sorted Binder", joinCode: "SORTED01" })
        .returning();
      const now = new Date();
      const insertedItems = await db
        .insert(schema.sessionItems)
        .values([
          {
            sessionId: session.id,
            entrySource: "manual",
            cardName: "Alpha Magician",
            setCode: "SET-001",
            passcode: "10000001",
            rarity: "Common",
            rarityConfirmedAt: now,
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Mint",
            quantity: 1,
          },
          {
            sessionId: session.id,
            entrySource: "manual",
            cardName: "Blue Dragon",
            setCode: "SET-002",
            passcode: "10000002",
            rarity: "Rare",
            rarityConfirmedAt: now,
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Mint",
            quantity: 6,
          },
          {
            sessionId: session.id,
            entrySource: "manual",
            cardName: "Crimson Dragon",
            setCode: "SET-003",
            passcode: "10000003",
            rarity: "Rare",
            rarityConfirmedAt: now,
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Near Mint",
            quantity: 3,
          },
          {
            sessionId: session.id,
            entrySource: "manual",
            cardName: "Delta Soldier",
            setCode: "SET-004",
            passcode: "10000004",
            rarity: "Common",
            rarityConfirmedAt: now,
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Played",
            quantity: 2,
          },
          {
            sessionId: session.id,
            entrySource: "manual",
            cardName: "Emerald Sage",
            setCode: "SET-005",
            passcode: "10000005",
            rarity: "Super Rare",
            rarityConfirmedAt: now,
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Mint",
            quantity: 4,
          },
          {
            sessionId: session.id,
            entrySource: "manual",
            cardName: "Frost Dragon",
            setCode: "SET-006",
            passcode: "10000006",
            rarity: "Ultra Rare",
            rarityConfirmedAt: now,
            printingIdentityTrusted: true,
            edition: "1st Edition",
            language: "English",
            condition: "Mint",
            quantity: 5,
          },
        ])
        .returning();

      await db.insert(schema.priceSnapshots).values(
        insertedItems.map((item) => ({
          sessionItemId: item.id,
          status: "priced",
          observedAmount: String(item.quantity),
          source: "ygoprodeck.card_sets.set_price",
          currency: "USD",
          observedAt: now,
        })),
      );

      const firstPage = await caller.collection.list();
      const secondPage = await caller.collection.list({ page: 2 });
      const filtered = await caller.collection.list({ query: "dragon" });
      const quantityDesc = await caller.collection.list({
        sortBy: "quantity",
        sortDirection: "desc",
      });
      const valueDesc = await caller.collection.list({
        sortBy: "estimatedValue",
        sortDirection: "desc",
      });

      expect(firstPage.pageSize).toBe(5);
      expect(firstPage.page).toBe(1);
      expect(firstPage.totalPages).toBe(2);
      expect(firstPage.collectionRowCount).toBe(6);
      expect(firstPage.filteredRowCount).toBe(6);
      expect(firstPage.rows).toHaveLength(5);
      expect(secondPage.rows).toHaveLength(1);
      expect(filtered.filteredRowCount).toBe(3);
      expect(filtered.rows.map((row) => row.cardName)).toEqual([
        "Blue Dragon",
        "Crimson Dragon",
        "Frost Dragon",
      ]);
      expect(quantityDesc.rows[0]?.cardName).toBe("Blue Dragon");
      expect(valueDesc.rows[0]?.cardName).toBe("Blue Dragon");
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
