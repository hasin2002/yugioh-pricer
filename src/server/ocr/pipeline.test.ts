import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { recognizeCardFrame } from "@/server/ocr/pipeline";
import type { CardFrameAnalysis, OcrEngine } from "@/server/ocr/types";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "ocr-pipeline-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("recognizeCardFrame", () => {
  it("runs OCR over preprocessed regions and stores source evidence", async () => {
    const imagePath = await createTestImage();
    const engine: OcrEngine = {
      name: "fake-ocr",
      async recognize(images) {
        return images.map((image) => ({
          imageId: image.id,
          observations:
            image.variant.name !== "gray-contrast"
              ? []
              : observationsForField(image.field),
        }));
      },
    };

    const result = await recognizeCardFrame(imagePath, {
      analysis: testAnalysis(),
      engine,
    });

    expect(result.status).toBe("completed");
    expect(result.cardNameText).toBe("TOOL BOX");
    expect(result.setCodeText).toBe("BLCR-EN021");
    expect(result.editionText).toBe("1st Edition");
    expect(result.serialNumberText).toBe("36468556");
    expect(result.sourceRegions.engineName).toBe("fake-ocr");
    expect(result.sourceRegions.regions.length).toBeGreaterThan(0);
    expect(
      result.sourceRegions.regions.some((region) =>
        region.variants.some((variant) => variant.observations.length > 0),
      ),
    ).toBe(true);
  });

  it("returns reviewable evidence when no OCR engine is available", async () => {
    const imagePath = await createTestImage();

    const result = await recognizeCardFrame(imagePath, {
      analysis: testAnalysis(),
      engine: null,
    });

    expect(result.status).toBe("engine_unavailable");
    expect(result.rawText).toContain("No local OCR engine is available");
    expect(result.sourceRegions.regions.length).toBeGreaterThan(0);
  });

  it("does not OCR a frame without a confident card shape unless forced", async () => {
    const imagePath = await createTestImage();
    const engine: OcrEngine = {
      name: "fake-ocr",
      async recognize() {
        throw new Error("should not run");
      },
    };

    const result = await recognizeCardFrame(imagePath, {
      analysis: testAnalysis({ cardLike: false }),
      engine,
    });

    expect(result.status).toBe("needs_review");
    expect(result.rawText).toContain("No confident card-shaped region");
    expect(result.sourceRegions.regions).toEqual([]);
  });
});

async function createTestImage() {
  const dir = await createTempDir();
  const imagePath = join(dir, "frame.jpg");

  await sharp({
    create: {
      width: 400,
      height: 600,
      channels: 3,
      background: "#d7c19a",
    },
  })
    .jpeg()
    .toFile(imagePath);

  return imagePath;
}

function testAnalysis(overrides: Partial<CardFrameAnalysis> = {}): CardFrameAnalysis {
  return {
    brightness: 120,
    cardLike: true,
    cardRect: { left: 40, top: 40, right: 360, bottom: 560, width: 320, height: 520 },
    edgeScore: 60,
    matchedEdges: 4,
    signature: "signature",
    structureScore: 180,
    textureScore: 35,
    imageWidth: 400,
    imageHeight: 600,
    ...overrides,
  };
}

function observationsForField(field: string) {
  switch (field) {
    case "cardName":
      return [{ text: "TOOL BOX", confidence: 92 }];
    case "setCode":
      return [{ text: "BLCR-ENO21", confidence: 76 }];
    case "edition":
      return [{ text: "1* Edition", confidence: 70 }];
    case "serialNumber":
      return [{ text: "36468556", confidence: 74 }];
    default:
      return [];
  }
}
