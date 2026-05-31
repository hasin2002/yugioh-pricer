import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  BestFrameUploadError,
  saveBestFrameFile,
} from "@/server/capture/best-frame";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "best-frame-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("saveBestFrameFile", () => {
  it("writes an accepted still frame to storage", async () => {
    const storageDir = await createTempDir();
    const frame = new File([new Uint8Array([1, 2, 3])], "frame.jpg", {
      type: "image/jpeg",
    });

    const savedFrame = await saveBestFrameFile(frame, {
      storageDir,
      id: "test-frame",
    });

    await expect(readFile(savedFrame.storagePath)).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(savedFrame).toEqual({
      storagePath: join(storageDir, "test-frame.jpg"),
      mimeType: "image/jpeg",
      sizeBytes: 3,
    });
  });

  it("rejects empty uploads with an actionable error", async () => {
    const storageDir = await createTempDir();
    const frame = new File([], "empty.jpg", { type: "image/jpeg" });

    await expect(saveBestFrameFile(frame, { storageDir })).rejects.toMatchObject({
      message: "Choose a captured frame before uploading.",
      statusCode: 400,
    } satisfies Partial<BestFrameUploadError>);
  });

  it("rejects unsupported image types", async () => {
    const storageDir = await createTempDir();
    const frame = new File([new Uint8Array([1])], "frame.gif", {
      type: "image/gif",
    });

    await expect(saveBestFrameFile(frame, { storageDir })).rejects.toMatchObject({
      message: "Upload a JPEG, PNG, or WebP still frame from the camera.",
      statusCode: 415,
    } satisfies Partial<BestFrameUploadError>);
  });
});
