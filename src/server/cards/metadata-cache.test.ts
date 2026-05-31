import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import {
  ensureCardMetadataFresh,
  getCardMetadataStatus,
  refreshCardMetadataCache,
  searchCardMetadata,
} from "@/server/cards/metadata-cache";
import * as schema from "@/server/db/schema";

function createTestDb() {
  const sqlite = new Database(":memory:");

  sqlite.exec(`
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
  `);

  return {
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  };
}

function ygoResponse() {
  return {
    data: [
      {
        id: 46986414,
        name: "Dark Magician",
        type: "Normal Monster",
        frameType: "normal",
        desc: "The ultimate wizard.",
        race: "Spellcaster",
        attribute: "DARK",
        card_images: [{ image_url_small: "https://images.test/dm.jpg" }],
        card_sets: [
          {
            set_name: "Legend of Blue Eyes White Dragon",
            set_code: "LOB-005",
            set_rarity: "Ultra Rare",
            set_rarity_code: "(UR)",
            set_price: "12.34",
          },
        ],
      },
      {
        id: 89631139,
        name: "Blue-Eyes White Dragon",
        type: "Normal Monster",
        frameType: "normal",
        card_sets: [
          {
            set_name: "Starter Deck Kaiba",
            set_code: "SDK-001",
            set_rarity: "Ultra Rare",
          },
        ],
      },
    ],
  };
}

function createFetchMock(payload = ygoResponse()) {
  return vi.fn(async () => new Response(JSON.stringify(payload))) as typeof fetch;
}

describe("card metadata cache", () => {
  it("fetches and persists YGOPRODeck cards and printings", async () => {
    const { db, close } = createTestDb();
    const fetcher = createFetchMock();

    try {
      const status = await refreshCardMetadataCache(db, {
        fetcher,
        now: new Date("2026-05-31T12:00:00.000Z"),
      });

      expect(fetcher).toHaveBeenCalledOnce();
      expect(status).toMatchObject({
        cardCount: 2,
        printingCount: 2,
        refreshRecommended: false,
      });
      expect(status.lastRefreshedAt).toBe("2026-05-31T12:00:00.000Z");
    } finally {
      close();
    }
  });

  it("refreshes when stale and skips refresh when cache is younger than 12 hours", async () => {
    const { db, close } = createTestDb();
    const fetcher = createFetchMock();

    try {
      await ensureCardMetadataFresh(db, {
        fetcher,
        now: new Date("2026-05-31T00:00:00.000Z"),
      });
      await ensureCardMetadataFresh(db, {
        fetcher,
        now: new Date("2026-05-31T11:59:59.000Z"),
      });
      await ensureCardMetadataFresh(db, {
        fetcher,
        now: new Date("2026-05-31T12:00:00.000Z"),
      });

      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      close();
    }
  });

  it("searches by card name, passcode, and set code", async () => {
    const { db, close } = createTestDb();

    try {
      await refreshCardMetadataCache(db, { fetcher: createFetchMock() });

      const byName = await searchCardMetadata(db, "dark mag");
      const byPasscode = await searchCardMetadata(db, "89631139");
      const bySetCode = await searchCardMetadata(db, "LOB-005");

      expect(byName[0]).toMatchObject({
        name: "Dark Magician",
        passcode: "46986414",
        setCode: "LOB-005",
        metadataOnly: true,
        pricingStatus: "requires_pricing",
      });
      expect(byPasscode[0]?.name).toBe("Blue-Eyes White Dragon");
      expect(bySetCode[0]).toMatchObject({
        name: "Dark Magician",
        setName: "Legend of Blue Eyes White Dragon",
        rarity: "Ultra Rare",
      });
    } finally {
      close();
    }
  });

  it("reports stale status when the cache is older than 12 hours", async () => {
    const { db, close } = createTestDb();

    try {
      await refreshCardMetadataCache(db, {
        fetcher: createFetchMock(),
        now: new Date("2026-05-31T00:00:00.000Z"),
      });

      await expect(
        getCardMetadataStatus(db, new Date("2026-05-31T12:00:01.000Z")),
      ).resolves.toMatchObject({ refreshRecommended: true });
    } finally {
      close();
    }
  });
});
