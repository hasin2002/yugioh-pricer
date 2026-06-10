import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import type {
  OcrBox,
  OcrEngine,
  OcrImageResult,
  OcrObservation,
  PreparedOcrImage,
} from "@/server/ocr/types";

const execFileAsync = promisify(execFile);
const OCR_TIMEOUT_MS = 90_000;
const VISION_BINARY_PATH = resolve("data/ocr-cache/macos-vision-ocr");
const VISION_SOURCE_PATH = resolve("src/server/ocr/macos-vision-ocr.swift");

let visionBinaryPromise: Promise<string | null> | null = null;

export async function createDefaultOcrEngine(): Promise<OcrEngine | null> {
  const vision = await createMacOSVisionOcrEngine();

  if (vision) {
    return vision;
  }

  return createTesseractOcrEngine();
}

export async function createMacOSVisionOcrEngine(): Promise<OcrEngine | null> {
  if (process.platform !== "darwin") {
    return null;
  }

  const binaryPath = await ensureVisionBinary();

  if (!binaryPath) {
    return null;
  }

  return {
    name: "macos-vision",
    async recognize(images) {
      const directory = await mkdtemp(join(tmpdir(), "vision-ocr-job-"));
      const jobPath = join(directory, "job.json");

      try {
        await writeFile(
          jobPath,
          JSON.stringify({ images: images.map((image) => image.variant.path) }),
        );

        const { stdout } = await execFileAsync(binaryPath, [jobPath], {
          maxBuffer: 10 * 1024 * 1024,
          timeout: OCR_TIMEOUT_MS,
        });
        const parsed = parseVisionOutput(stdout);
        const resultByPath = new Map(
          parsed.images.map((image) => [image.path, image.observations]),
        );

        return images.map((image) => ({
          imageId: image.id,
          observations: resultByPath.get(image.variant.path) ?? [],
        }));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}

export async function createTesseractOcrEngine(): Promise<OcrEngine | null> {
  if (!(await commandExists("tesseract"))) {
    return null;
  }

  return {
    name: "tesseract",
    async recognize(images) {
      const results: OcrImageResult[] = [];

      for (const image of images) {
        results.push({
          imageId: image.id,
          observations: await recognizeWithTesseract(image),
        });
      }

      return results;
    },
  };
}

async function ensureVisionBinary() {
  visionBinaryPromise ??= buildVisionBinary();

  return visionBinaryPromise;
}

async function buildVisionBinary() {
  if (!(await commandExists("swiftc"))) {
    return null;
  }

  try {
    const [sourceStat, binaryStat] = await Promise.all([
      stat(VISION_SOURCE_PATH),
      stat(VISION_BINARY_PATH).catch(() => null),
    ]);

    if (!binaryStat || binaryStat.mtimeMs < sourceStat.mtimeMs) {
      await mkdir(dirname(VISION_BINARY_PATH), { recursive: true });
      await execFileAsync("swiftc", [VISION_SOURCE_PATH, "-o", VISION_BINARY_PATH], {
        timeout: OCR_TIMEOUT_MS,
      });
    }

    await execFileAsync(VISION_BINARY_PATH, ["--health-check"], {
      timeout: 5_000,
    });

    return VISION_BINARY_PATH;
  } catch {
    return null;
  }
}

async function commandExists(command: string) {
  try {
    await execFileAsync("sh", ["-lc", `command -v ${command}`], {
      timeout: 5_000,
    });

    return true;
  } catch {
    return false;
  }
}

type VisionOutput = {
  images: Array<{
    path: string;
    observations: OcrObservation[];
  }>;
};

function parseVisionOutput(stdout: string): VisionOutput {
  const parsed = JSON.parse(stdout) as VisionOutput;

  return {
    images: parsed.images.map((image) => ({
      path: image.path,
      observations: image.observations.map((observation) => ({
        text: observation.text,
        confidence: normalizeConfidence(observation.confidence),
        boundingBox: observation.boundingBox,
      })),
    })),
  };
}

async function recognizeWithTesseract(image: PreparedOcrImage) {
  const args = [
    image.variant.path,
    "stdout",
    "--psm",
    String(image.region.psm),
    "-l",
    "eng",
  ];

  if (image.region.whitelist) {
    args.push("-c", `tessedit_char_whitelist=${image.region.whitelist}`);
  }

  args.push("tsv");

  const { stdout } = await execFileAsync("tesseract", args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: OCR_TIMEOUT_MS,
  });

  return parseTesseractTsv(stdout);
}

function parseTesseractTsv(tsv: string): OcrObservation[] {
  const [headerLine, ...lines] = tsv.split(/\r?\n/).filter(Boolean);

  if (!headerLine) {
    return [];
  }

  const headers = headerLine.split("\t");
  const index = Object.fromEntries(
    headers.map((header, headerIndex) => [header, headerIndex]),
  );
  const groups = new Map<
    string,
    {
      words: string[];
      confidences: number[];
      left: number;
      top: number;
      right: number;
      bottom: number;
    }
  >();

  for (const line of lines) {
    const columns = line.split("\t");
    const text = columns[index.text]?.trim();
    const confidence = Number(columns[index.conf]);

    if (!text || !Number.isFinite(confidence) || confidence < 0) {
      continue;
    }

    const groupKey = [
      columns[index.page_num],
      columns[index.block_num],
      columns[index.par_num],
      columns[index.line_num],
    ].join(":");
    const left = numberColumn(columns, index.left);
    const top = numberColumn(columns, index.top);
    const width = numberColumn(columns, index.width);
    const height = numberColumn(columns, index.height);
    const existing = groups.get(groupKey);

    if (existing) {
      existing.words.push(text);
      existing.confidences.push(confidence);
      existing.left = Math.min(existing.left, left);
      existing.top = Math.min(existing.top, top);
      existing.right = Math.max(existing.right, left + width);
      existing.bottom = Math.max(existing.bottom, top + height);
    } else {
      groups.set(groupKey, {
        words: [text],
        confidences: [confidence],
        left,
        top,
        right: left + width,
        bottom: top + height,
      });
    }
  }

  return [...groups.values()].map((group) => ({
    text: group.words.join(" "),
    confidence:
      group.confidences.reduce((total, confidence) => total + confidence, 0) /
      group.confidences.length,
    boundingBox: {
      left: group.left,
      top: group.top,
      width: group.right - group.left,
      height: group.bottom - group.top,
    } satisfies OcrBox,
  }));
}

function numberColumn(columns: string[], index: number | undefined) {
  const value = index === undefined ? NaN : Number(columns[index]);

  return Number.isFinite(value) ? value : 0;
}

function normalizeConfidence(confidence: number | null) {
  if (confidence === null || !Number.isFinite(confidence)) {
    return null;
  }

  return Math.max(0, Math.min(100, confidence));
}
