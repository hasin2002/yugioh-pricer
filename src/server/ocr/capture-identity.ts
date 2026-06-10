import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { findExactCardMetadataByName } from "@/server/cards/metadata-cache";
import type * as schema from "@/server/db/schema";
import type { OcrPipelineResult } from "@/server/ocr/types";

const MIN_METADATA_CARD_NAME_CONFIDENCE = 80;

type Db = BetterSQLite3Database<typeof schema>;

export type CaptureIdentity = {
  cardName: string;
  setCode: string;
  passcode: string;
  edition: string;
};

export async function captureIdentityFromOcr(
  db: Db,
  ocrResult: OcrPipelineResult,
): Promise<CaptureIdentity> {
  const metadataMatch =
    ocrResult.cardNameText &&
    (ocrResult.cardNameConfidence ?? 0) >= MIN_METADATA_CARD_NAME_CONFIDENCE
      ? await findExactCardMetadataByName(db, ocrResult.cardNameText)
      : null;

  return {
    cardName: metadataMatch?.name ?? ocrResult.cardNameText ?? "Captured card",
    setCode: ocrResult.setCodeText ?? "Unknown",
    passcode:
      metadataMatch?.passcode ?? ocrResult.serialNumberText ?? "Unknown",
    edition: ocrResult.editionText ?? "1st Edition",
  };
}
