import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import { captureIdentityFromOcr } from "@/server/ocr/capture-identity";
import * as schema from "@/server/db/schema";
import type { OcrPipelineResult } from "@/server/ocr/types";

function createTestDb() {
  const sqlite = new Database(":memory:");

  sqlite.exec(`
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

    INSERT INTO card_metadata_cards (
      passcode,
      name,
      normalized_name,
      card_type,
      updated_at
    ) VALUES (
      '58415502',
      'Royal Straight',
      'royal straight',
      'Spell Card',
      unixepoch()
    );
  `);

  return {
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  };
}

describe("captureIdentityFromOcr", () => {
  it("recovers passcode from exact metadata when OCR reads a confident card name", async () => {
    const { db, close } = createTestDb();

    try {
      await expect(
        captureIdentityFromOcr(
          db,
          ocrResult({
            cardNameText: "ROYAL STRAIGHT",
            cardNameConfidence: 96,
            serialNumberText: null,
          }),
        ),
      ).resolves.toMatchObject({
        cardName: "Royal Straight",
        passcode: "58415502",
      });
    } finally {
      close();
    }
  });

  it("does not recover metadata from low-confidence card-name OCR", async () => {
    const { db, close } = createTestDb();

    try {
      await expect(
        captureIdentityFromOcr(
          db,
          ocrResult({
            cardNameText: "ROYAL STRAIGHT",
            cardNameConfidence: 60,
            serialNumberText: null,
          }),
        ),
      ).resolves.toMatchObject({
        cardName: "ROYAL STRAIGHT",
        passcode: "Unknown",
      });
    } finally {
      close();
    }
  });
});

function ocrResult(overrides: Partial<OcrPipelineResult> = {}): OcrPipelineResult {
  return {
    status: "completed",
    rawText: null,
    cardNameText: null,
    cardNameConfidence: null,
    setCodeText: null,
    setCodeConfidence: null,
    editionText: null,
    editionConfidence: null,
    serialNumberText: null,
    serialNumberConfidence: null,
    sourceRegions: {
      engineName: "test",
      cardAnalysis: {
        brightness: 120,
        cardLike: true,
        cardRect: {
          left: 0,
          top: 0,
          right: 100,
          bottom: 150,
          width: 100,
          height: 150,
        },
        edgeScore: 40,
        matchedEdges: 4,
        signature: "abc",
        structureScore: 180,
        textureScore: 35,
        imageWidth: 100,
        imageHeight: 150,
      },
      cardRect: {
        left: 0,
        top: 0,
        right: 100,
        bottom: 150,
        width: 100,
        height: 150,
      },
      regions: [],
    },
    ...overrides,
  };
}
