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
      edition text NOT NULL,
      language text NOT NULL,
      condition text NOT NULL,
      quantity integer NOT NULL,
      created_at integer DEFAULT (unixepoch()) NOT NULL,
      updated_at integer DEFAULT (unixepoch()) NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });

  return {
    caller: appRouter.createCaller({ db }),
    db,
    close: () => sqlite.close(),
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
      });
      expect(items).toHaveLength(1);
      expect(sessions[0]?.reviewCount).toBe(2);
    } finally {
      close();
    }
  });

  it("uses manual item defaults for printing identity fields", async () => {
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
