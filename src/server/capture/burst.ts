import type { SavedBestFrameFile } from "@/server/capture/best-frame";
import {
  BestFrameUploadError,
  saveBestFrameFile,
} from "@/server/capture/best-frame";

export const CAPTURE_BURST_FRAME_COUNT = 4;
const MAX_SIGNATURE_LENGTH = 512;

export class CaptureBurstError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "CaptureBurstError";
  }
}

export type SavedCaptureBurst = {
  bestFrame: SavedBestFrameFile;
  candidateFrameCount: number;
  candidateFrames: SavedCaptureCandidateFrameMetadata[];
};

export type CandidateFrameMetrics = {
  cardLike: boolean | null;
  brightness: number | null;
  signature: string | null;
};

export type SavedCaptureCandidateFrameMetadata = CandidateFrameMetrics & {
  position: number;
  selectedAsBest: boolean;
  mimeType: string;
  sizeBytes: number;
};

type SaveCaptureBurstOptions = {
  storageDir?: string;
  idPrefix?: string;
  candidateFrameMetrics?: CandidateFrameMetrics[];
};

export function candidateFramesFromFormData(formData: FormData) {
  return formData
    .getAll("frames")
    .filter((frame): frame is File => frame instanceof File);
}

export function candidateFrameMetricsFromFormData(formData: FormData) {
  const rawMetadata = formData.get("candidateFrameMetadata");

  if (rawMetadata === null || rawMetadata === "") {
    return [];
  }

  if (typeof rawMetadata !== "string") {
    throw new CaptureBurstError("Candidate frame metadata must be JSON.", 400);
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawMetadata);
  } catch {
    throw new CaptureBurstError("Candidate frame metadata must be valid JSON.", 400);
  }

  if (!Array.isArray(parsed)) {
    throw new CaptureBurstError("Candidate frame metadata must be a list.", 400);
  }

  return parsed.map(normalizeCandidateFrameMetrics);
}

export function selectBestCandidateFrameIndex(frames: File[]) {
  if (frames.length !== CAPTURE_BURST_FRAME_COUNT) {
    throw new CaptureBurstError(
      "Capture a four-frame burst before uploading.",
      400,
    );
  }

  const firstUsableIndex = frames.findIndex((frame) => frame.size > 0);

  if (firstUsableIndex === -1) {
    throw new CaptureBurstError(
      "No usable candidate frames were captured. Hold steady and try again.",
      422,
    );
  }

  return frames.reduce(
    (bestIndex, frame, index) =>
      frame.size > frames[bestIndex]!.size ? index : bestIndex,
    firstUsableIndex,
  );
}

export function selectBestCandidateFrame(frames: File[]) {
  return frames[selectBestCandidateFrameIndex(frames)]!;
}

export async function saveCaptureBurst(
  frames: File[],
  options: SaveCaptureBurstOptions = {},
): Promise<SavedCaptureBurst> {
  const bestCandidateIndex = selectBestCandidateFrameIndex(frames);
  const bestCandidate = frames[bestCandidateIndex]!;

  try {
    const bestFrame = await saveBestFrameFile(bestCandidate, {
      storageDir: options.storageDir,
      id: options.idPrefix ? `${options.idPrefix}-best` : undefined,
    });

    return {
      bestFrame,
      candidateFrameCount: frames.length,
      candidateFrames: candidateFrameMetadataForFrames(
        frames,
        options.candidateFrameMetrics ?? [],
        bestCandidateIndex,
      ),
    };
  } catch (error) {
    if (error instanceof BestFrameUploadError) {
      throw new CaptureBurstError(error.message, error.statusCode);
    }

    throw error;
  }
}

function candidateFrameMetadataForFrames(
  frames: File[],
  metrics: CandidateFrameMetrics[],
  selectedIndex: number,
) {
  return frames.map((frame, index) => ({
    position: index + 1,
    selectedAsBest: index === selectedIndex,
    mimeType: frame.type || "application/octet-stream",
    sizeBytes: frame.size,
    cardLike: metrics[index]?.cardLike ?? null,
    brightness: metrics[index]?.brightness ?? null,
    signature: metrics[index]?.signature ?? null,
  }));
}

function normalizeCandidateFrameMetrics(value: unknown): CandidateFrameMetrics {
  if (!value || typeof value !== "object") {
    return {
      cardLike: null,
      brightness: null,
      signature: null,
    };
  }

  const record = value as Record<string, unknown>;
  const brightness =
    typeof record.brightness === "number" && Number.isFinite(record.brightness)
      ? Math.max(0, Math.min(255, Math.round(record.brightness)))
      : null;
  const signature =
    typeof record.signature === "string" && record.signature.trim()
      ? record.signature.trim().slice(0, MAX_SIGNATURE_LENGTH)
      : null;

  return {
    cardLike: typeof record.cardLike === "boolean" ? record.cardLike : null,
    brightness,
    signature,
  };
}
