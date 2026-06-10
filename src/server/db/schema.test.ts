import { describe, expect, it } from "vitest";

import {
  appMeta,
  bestFrames,
  captureCandidateFrames,
  cardMetadataCards,
  cardMetadataPrintings,
  ocrEvidence,
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
    expect(sessionItems.captureFingerprint.name).toBe("capture_fingerprint");
    expect(sessionItems.entrySource.name).toBe("entry_source");
    expect(sessionItems.rarityConfirmedAt.name).toBe("rarity_confirmed_at");
    expect(sessionItems.printingIdentityTrusted.name).toBe(
      "printing_identity_trusted",
    );
  });

  it("defines candidate frame metadata for captured items", () => {
    expect(captureCandidateFrames[Symbol.for("drizzle:Name")]).toBe(
      "capture_candidate_frames",
    );
    expect(captureCandidateFrames.sessionItemId.name).toBe("session_item_id");
    expect(captureCandidateFrames.selectedAsBest.name).toBe("selected_as_best");
    expect(captureCandidateFrames.cardLike.name).toBe("card_like");
    expect(captureCandidateFrames.brightness.name).toBe("brightness");
  });

  it("defines OCR Evidence shell fields for captured items", () => {
    expect(ocrEvidence[Symbol.for("drizzle:Name")]).toBe("ocr_evidence");
    expect(ocrEvidence.sessionItemId.name).toBe("session_item_id");
    expect(ocrEvidence.cardNameText.name).toBe("card_name_text");
    expect(ocrEvidence.setCodeText.name).toBe("set_code_text");
    expect(ocrEvidence.editionText.name).toBe("edition_text");
    expect(ocrEvidence.serialNumberText.name).toBe("serial_number_text");
  });

  it("defines price snapshots for session items", () => {
    expect(priceSnapshots[Symbol.for("drizzle:Name")]).toBe("price_snapshots");
    expect(priceSnapshots.sessionItemId.name).toBe("session_item_id");
    expect(priceSnapshots.observedAmount.name).toBe("observed_amount");
    expect(priceSnapshots.currency.name).toBe("currency");
    expect(priceSnapshots.observedAt.name).toBe("observed_at");
  });
});
