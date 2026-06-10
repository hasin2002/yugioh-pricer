import sharp from "sharp";

import { captureFrameQuality } from "@/lib/capture-quality";
import type { CandidateFrameMetrics } from "@/server/capture/burst";
import type { CardFrameAnalysis } from "@/server/ocr/types";

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
