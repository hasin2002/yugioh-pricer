import { describe, expect, it } from "vitest";

import {
  appMeta,
  bestFrames,
  cardMetadataCards,
  cardMetadataPrintings,
  priceSnapshots,
  pricingSessions,
  sessionItems,
} from "@/server/db/schema";

describe("database schema", () => {
  it("defines the initial app metadata table", () => {
    expect(appMeta[Symbol.for("drizzle:Name")]).toBe("app_meta");
  });

  it("defines the best frame storage table", () => {
    expect(bestFrames[Symbol.for("drizzle:Name")]).toBe("best_frames");
  });

  it("defines the pricing sessions table", () => {
    expect(pricingSessions[Symbol.for("drizzle:Name")]).toBe(
      "pricing_sessions",
    );
    expect(pricingSessions.joinCode.name).toBe("join_code");
    expect(pricingSessions.activeCaptureClientId.name).toBe(
      "active_capture_client_id",
    );
  });

  it("defines card metadata cache tables", () => {
    expect(cardMetadataCards[Symbol.for("drizzle:Name")]).toBe(
      "card_metadata_cards",
    );
    expect(cardMetadataPrintings[Symbol.for("drizzle:Name")]).toBe(
      "card_metadata_printings",
    );
    expect(cardMetadataCards.passcode.name).toBe("passcode");
    expect(cardMetadataPrintings.setCode.name).toBe("set_code");
  });

  it("defines session items with optional best frame evidence", () => {
    expect(sessionItems[Symbol.for("drizzle:Name")]).toBe("session_items");
    expect(sessionItems.sessionId.name).toBe("session_id");
    expect(sessionItems.bestFrameId.name).toBe("best_frame_id");
    expect(sessionItems.entrySource.name).toBe("entry_source");
  });

  it("defines price snapshots for session items", () => {
    expect(priceSnapshots[Symbol.for("drizzle:Name")]).toBe("price_snapshots");
    expect(priceSnapshots.sessionItemId.name).toBe("session_item_id");
    expect(priceSnapshots.observedAmount.name).toBe("observed_amount");
    expect(priceSnapshots.currency.name).toBe("currency");
    expect(priceSnapshots.observedAt.name).toBe("observed_at");
  });
});
