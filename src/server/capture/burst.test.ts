import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import {
  CaptureBurstError,
  candidateFrameMetricsFromFormData,
  saveCaptureBurst,
  selectBestCandidateFrame,
  selectBestCandidateFrameIndex,
} from "@/server/capture/burst";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "capture-burst-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("selectBestCandidateFrame", () => {
  it("requires a four-frame burst", () => {
    const frames = [
      new File([new Uint8Array([1])], "one.jpg", { type: "image/jpeg" }),
    ];

    expect(() => selectBestCandidateFrame(frames)).toThrow(
      "Capture a four-frame burst before uploading.",
    );
  });

  it("rejects bursts where every candidate frame is unusable", () => {
    const frames = Array.from(
      { length: 4 },
      (_, index) => new File([], `${index}.jpg`, { type: "image/jpeg" }),
    );

    expect(() => selectBestCandidateFrame(frames)).toThrow(
      "No usable candidate frames were captured. Hold steady and try again.",
    );
  });

  it("selects the largest usable candidate as the initial best frame", () => {
    const frames = [
      new File([new Uint8Array([1])], "small.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([1, 2, 3])], "large.jpg", {
        type: "image/jpeg",
      }),
      new File([], "empty.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([1, 2])], "medium.jpg", { type: "image/jpeg" }),
    ];

    expect(selectBestCandidateFrame(frames).name).toBe("large.jpg");
    expect(selectBestCandidateFrameIndex(frames)).toBe(1);
  });
});

describe("candidateFrameMetricsFromFormData", () => {
  it("normalizes optional capture quality metadata", () => {
    const formData = new FormData();
    formData.set(
      "candidateFrameMetadata",
      JSON.stringify([
        {
          cardLike: true,
          brightness: 90.6,
          signature: "  abc123  ",
        },
        {
          cardLike: false,
          brightness: -12,
          signature: "",
        },
      ]),
    );

    expect(candidateFrameMetricsFromFormData(formData)).toEqual([
      {
        cardLike: true,
        brightness: 91,
        signature: "abc123",
      },
      {
        cardLike: false,
        brightness: 0,
        signature: null,
      },
    ]);
  });

  it("rejects malformed capture quality metadata", () => {
    const formData = new FormData();
    formData.set("candidateFrameMetadata", "{not json");

    expect(() => candidateFrameMetricsFromFormData(formData)).toThrow(
      "Candidate frame metadata must be valid JSON.",
    );
  });
});

describe("saveCaptureBurst", () => {
  it("stores the selected best frame from the candidate burst", async () => {
    const storageDir = await createTempDir();
    const frames = [
      new File([new Uint8Array([1])], "small.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([1, 2, 3])], "large.jpg", {
        type: "image/jpeg",
      }),
      new File([new Uint8Array([1, 2])], "medium.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([1])], "small-2.jpg", { type: "image/jpeg" }),
    ];

    const saved = await saveCaptureBurst(frames, {
      storageDir,
      idPrefix: "burst",
    });

    await expect(readFile(saved.bestFrame.storagePath)).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(saved.bestFrame.storagePath).toBe(join(storageDir, "burst-best.jpg"));
    expect(saved.candidateFrameCount).toBe(4);
    expect(saved.candidateFrames).toEqual([
      expect.objectContaining({
        position: 1,
        selectedAsBest: false,
        sizeBytes: 1,
      }),
      expect.objectContaining({
        position: 2,
        selectedAsBest: true,
        sizeBytes: 3,
      }),
      expect.objectContaining({
        position: 3,
        selectedAsBest: false,
        sizeBytes: 2,
      }),
      expect.objectContaining({
        position: 4,
        selectedAsBest: false,
        sizeBytes: 1,
      }),
    ]);
  });

  it("stores client-provided candidate frame metrics with the burst", async () => {
    const storageDir = await createTempDir();
    const frames = [
      new File([new Uint8Array([1])], "small.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([1, 2, 3])], "large.jpg", {
        type: "image/jpeg",
      }),
      new File([new Uint8Array([1, 2])], "medium.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array([1])], "small-2.jpg", { type: "image/jpeg" }),
    ];

    const saved = await saveCaptureBurst(frames, {
      storageDir,
      candidateFrameMetrics: [
        { cardLike: true, brightness: 80, signature: "aaaa" },
        { cardLike: true, brightness: 90, signature: "bbbb" },
        { cardLike: false, brightness: 70, signature: "cccc" },
        { cardLike: null, brightness: null, signature: null },
      ],
    });

    expect(saved.candidateFrames[1]).toMatchObject({
      position: 2,
      selectedAsBest: true,
      cardLike: true,
      brightness: 90,
      signature: "bbbb",
    });
    expect(saved.candidateFrames[2]).toMatchObject({
      position: 3,
      selectedAsBest: false,
      cardLike: false,
      brightness: 70,
      signature: "cccc",
    });
  });

  it("converts still-frame validation into burst upload errors", async () => {
    const storageDir = await createTempDir();
    const frames = Array.from(
      { length: 4 },
      (_, index) => new File([new Uint8Array([1])], `${index}.gif`, {
        type: "image/gif",
      }),
    );

    await expect(saveCaptureBurst(frames, { storageDir })).rejects.toMatchObject({
      message: "Upload a JPEG, PNG, or WebP still frame from the camera.",
      statusCode: 415,
    } satisfies Partial<CaptureBurstError>);
  });
});
