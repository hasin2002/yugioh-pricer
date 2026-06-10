import sharp from "sharp";

import { captureFrameQuality } from "@/lib/capture-quality";
import type { CandidateFrameMetrics } from "@/server/capture/burst";
import type { CardFrameAnalysis, OcrPipelineResult } from "@/server/ocr/types";

export async function analyzeCardFrame(imagePath: string): Promise<CardFrameAnalysis> {
  const { data, info } = await sharp(imagePath)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const quality = captureFrameQuality({
    data,
    width: info.width,
    height: info.height,
  });

  return {
    ...quality,
    imageWidth: info.width,
    imageHeight: info.height,
  };
}

export function shouldDiscardNoCardCapture(
  analysis: CardFrameAnalysis,
  candidateMetrics: CandidateFrameMetrics[],
) {
  const knownClientMetrics = candidateMetrics.filter(
    (metric) => metric.cardLike !== null,
  );
  const clientConfidentlyNoCard =
    knownClientMetrics.length >= 3 &&
    knownClientMetrics.every((metric) => metric.cardLike === false);
  const clientSawCard = candidateMetrics.some((metric) => metric.cardLike === true);
  const serverClearlyNoCard =
    !analysis.cardLike &&
    analysis.matchedEdges <= 2 &&
    analysis.structureScore < 110;
  const serverExtremelyNoCard =
    !analysis.cardLike &&
    analysis.matchedEdges <= 1 &&
    analysis.structureScore < 90;

  if (clientSawCard) {
    return false;
  }

  return (
    (clientConfidentlyNoCard && serverClearlyNoCard) ||
    (knownClientMetrics.length === 0 && serverExtremelyNoCard)
  );
}

export function shouldDiscardUnidentifiedCapture(
  analysis: CardFrameAnalysis,
  ocrResult: Pick<
    OcrPipelineResult,
    | "status"
    | "cardNameText"
    | "setCodeText"
    | "editionText"
    | "serialNumberText"
  >,
) {
  if (ocrResult.status !== "needs_review") {
    return false;
  }

  const hasOcrCandidate = Boolean(
    ocrResult.cardNameText ||
      ocrResult.setCodeText ||
      ocrResult.editionText ||
      ocrResult.serialNumberText,
  );
  const weakServerCardShape =
    analysis.matchedEdges <= 3 &&
    analysis.structureScore < 175 &&
    analysis.textureScore < 30;

  return !hasOcrCandidate && weakServerCardShape;
}
