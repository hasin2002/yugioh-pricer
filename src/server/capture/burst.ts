import type { SavedBestFrameFile } from "@/server/capture/best-frame";
import {
  BestFrameUploadError,
  saveBestFrameFile,
} from "@/server/capture/best-frame";

export const CAPTURE_BURST_FRAME_COUNT = 4;

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
};

type SaveCaptureBurstOptions = {
  storageDir?: string;
  idPrefix?: string;
};

export function candidateFramesFromFormData(formData: FormData) {
  return formData
    .getAll("frames")
    .filter((frame): frame is File => frame instanceof File);
}

export function selectBestCandidateFrame(frames: File[]) {
  if (frames.length !== CAPTURE_BURST_FRAME_COUNT) {
    throw new CaptureBurstError(
      "Capture a four-frame burst before uploading.",
      400,
    );
  }

  const usableFrames = frames.filter((frame) => frame.size > 0);

  if (usableFrames.length === 0) {
    throw new CaptureBurstError(
      "No usable candidate frames were captured. Hold steady and try again.",
      422,
    );
  }

  return usableFrames.reduce((bestFrame, frame) =>
    frame.size > bestFrame.size ? frame : bestFrame,
  );
}

export async function saveCaptureBurst(
  frames: File[],
  options: SaveCaptureBurstOptions = {},
): Promise<SavedCaptureBurst> {
  const bestCandidate = selectBestCandidateFrame(frames);

  try {
    const bestFrame = await saveBestFrameFile(bestCandidate, {
      storageDir: options.storageDir,
      id: options.idPrefix ? `${options.idPrefix}-best` : undefined,
    });

    return {
      bestFrame,
      candidateFrameCount: frames.length,
    };
  } catch (error) {
    if (error instanceof BestFrameUploadError) {
      throw new CaptureBurstError(error.message, error.statusCode);
    }

    throw error;
  }
}
