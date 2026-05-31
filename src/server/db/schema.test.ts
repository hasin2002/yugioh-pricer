import { describe, expect, it } from "vitest";

import {
  appMeta,
  bestFrames,
  cardMetadataCards,
  cardMetadataPrintings,
  pricingSessions,
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
});
