import { analyzeCardFrame } from "@/server/ocr/card-analysis";
import { extractOcrCandidates } from "@/server/ocr/candidates";
import { createDefaultOcrEngine } from "@/server/ocr/engines";
import { prepareOcrImages } from "@/server/ocr/preprocess";
import type {
  CardFrameAnalysis,
  OcrEngine,
  OcrImageResult,
  OcrPipelineResult,
  OcrSourceRegions,
  PreparedOcrImage,
} from "@/server/ocr/types";

type RecognizeCardFrameOptions = {
  analysis?: CardFrameAnalysis;
  engine?: OcrEngine | null;
  forceOcr?: boolean;
};

export async function recognizeCardFrame(
  imagePath: string,
  options: RecognizeCardFrameOptions = {},
): Promise<OcrPipelineResult> {
  const analysis = options.analysis ?? (await analyzeCardFrame(imagePath));

  if (!analysis.cardLike && !options.forceOcr) {
    return emptyOcrResult({
      status: "needs_review",
      rawText: "No confident card-shaped region was detected for OCR.",
      sourceRegions: baseSourceRegions(null, analysis, [], []),
    });
  }

  const prepared = await prepareOcrImages(imagePath, analysis);

  try {
    const engine =
      "engine" in options ? options.engine : await createDefaultOcrEngine();

    if (!engine) {
      return emptyOcrResult({
        status: "engine_unavailable",
        rawText:
          "No local OCR engine is available. macOS Vision could not be used and native tesseract was not found.",
        sourceRegions: baseSourceRegions(null, analysis, prepared.images, []),
      });
    }

    let results: OcrImageResult[];

    try {
      results = await engine.recognize(prepared.images);
    } catch (error) {
      return emptyOcrResult({
        status: "failed",
        rawText: ocrErrorMessage(error),
        sourceRegions: baseSourceRegions(engine.name, analysis, prepared.images, [], {
          error: ocrErrorMessage(error),
        }),
      });
    }

    const candidates = extractOcrCandidates(prepared.images, results);
    const hasCandidate = Boolean(
      candidates.cardNameText ||
        candidates.setCodeText ||
        candidates.editionText ||
        candidates.serialNumberText,
    );

    return {
      status: hasCandidate ? "completed" : "needs_review",
      ...candidates,
      sourceRegions: baseSourceRegions(engine.name, analysis, prepared.images, results),
    };
  } finally {
    await prepared.cleanup();
  }
}

function emptyOcrResult(
  result: Pick<OcrPipelineResult, "status" | "rawText" | "sourceRegions">,
): OcrPipelineResult {
  return {
    ...result,
    cardNameText: null,
    cardNameConfidence: null,
    setCodeText: null,
    setCodeConfidence: null,
    editionText: null,
    editionConfidence: null,
    serialNumberText: null,
    serialNumberConfidence: null,
  };
}

function baseSourceRegions(
  engineName: string | null,
  analysis: CardFrameAnalysis,
  images: PreparedOcrImage[],
  results: OcrImageResult[],
  extras: Partial<OcrSourceRegions> = {},
): OcrSourceRegions {
  const resultsByImageId = new Map(
    results.map((result) => [result.imageId, result.observations]),
  );
  const regions = new Map<string, OcrSourceRegions["regions"][number]>();

  for (const image of images) {
    const existing =
      regions.get(image.region.id) ??
      {
        id: image.region.id,
        field: image.field,
        label: image.region.label,
        relativeBox: image.region.relativeBox,
        sourceBox: image.region.sourceBox,
        variants: [],
      };

    existing.variants.push({
      name: image.variant.name,
      observations: resultsByImageId.get(image.id) ?? [],
    });
    regions.set(image.region.id, existing);
  }

  return {
    engineName,
    cardAnalysis: analysis,
    cardRect: analysis.cardRect,
    regions: [...regions.values()],
    ...extras,
  };
}

function ocrErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The local OCR engine failed while processing the scan.";
}
