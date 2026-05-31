import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey().notNull(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const bestFrames = sqliteTable("best_frames", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const pricingSessions = sqliteTable("pricing_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  activeCaptureClientId: text("active_capture_client_id"),
  activeCaptureClientJoinedAt: integer("active_capture_client_joined_at", {
    mode: "timestamp",
  }),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  reviewCount: integer("review_count").default(0).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const cardMetadataCards = sqliteTable("card_metadata_cards", {
  passcode: text("passcode").primaryKey().notNull(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  cardType: text("card_type").notNull(),
  frameType: text("frame_type"),
  description: text("description"),
  race: text("race"),
  attribute: text("attribute"),
  imageUrl: text("image_url"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const cardMetadataPrintings = sqliteTable("card_metadata_printings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  passcode: text("passcode")
    .notNull()
    .references(() => cardMetadataCards.passcode, { onDelete: "cascade" }),
  setName: text("set_name").notNull(),
  setCode: text("set_code").notNull().unique(),
  rarity: text("rarity"),
  rarityCode: text("rarity_code"),
  sourceSetPrice: text("source_set_price"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const sessionItems = sqliteTable("session_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => pricingSessions.id, { onDelete: "cascade" }),
  bestFrameId: integer("best_frame_id").references(() => bestFrames.id, {
    onDelete: "set null",
  }),
  entrySource: text("entry_source").notNull(),
  cardName: text("card_name").notNull(),
  setCode: text("set_code").notNull(),
  passcode: text("passcode").notNull(),
  rarity: text("rarity").notNull(),
  edition: text("edition").notNull(),
  language: text("language").notNull(),
  condition: text("condition").notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const priceSnapshots = sqliteTable("price_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionItemId: integer("session_item_id")
    .notNull()
    .references(() => sessionItems.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  observedAmount: text("observed_amount"),
  source: text("source").notNull(),
  currency: text("currency"),
  observedAt: integer("observed_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});
