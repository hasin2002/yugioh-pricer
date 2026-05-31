import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const MAX_FRAME_BYTES = 8 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class BestFrameUploadError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "BestFrameUploadError";
  }
}

export type SavedBestFrameFile = {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
};

type SaveBestFrameFileOptions = {
  storageDir?: string;
  id?: string;
};

export async function saveBestFrameFile(
  frame: File,
  options: SaveBestFrameFileOptions = {},
): Promise<SavedBestFrameFile> {
  if (frame.size === 0) {
    throw new BestFrameUploadError("Choose a captured frame before uploading.", 400);
  }

  if (frame.size > MAX_FRAME_BYTES) {
    throw new BestFrameUploadError(
      "The captured frame is too large. Retake the photo closer to the card.",
      413,
    );
  }

  const extension = MIME_EXTENSIONS[frame.type];

  if (!extension) {
    throw new BestFrameUploadError(
      "Upload a JPEG, PNG, or WebP still frame from the camera.",
      415,
    );
  }

  const storageDir = options.storageDir ?? "./data/best-frames";
  const id = options.id ?? randomUUID();
  const storagePath = join(storageDir, `${id}.${extension}`);
  const bytes = Buffer.from(await frame.arrayBuffer());

  await mkdir(storageDir, { recursive: true });
  await writeFile(storagePath, bytes, { flag: "wx" });

  return {
    storagePath,
    mimeType: frame.type,
    sizeBytes: bytes.byteLength,
  };
}
