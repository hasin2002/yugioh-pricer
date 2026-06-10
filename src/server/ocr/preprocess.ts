import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import sharp from "sharp";

import type {
  CardFrameAnalysis,
  OcrBox,
  OcrField,
  OcrRegion,
  PreparedOcrImage,
} from "@/server/ocr/types";

type RegionTemplate = {
  id: string;
  field: OcrField;
  label: string;
  relativeBox: OcrBox;
  psm: number;
  whitelist?: string;
};

const SET_CODE_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-";
const SERIAL_NUMBER_WHITELIST = "0123456789";

const REGION_TEMPLATES: RegionTemplate[] = [
  {
    id: "title-band",
    field: "cardName",
    label: "Card title band",
    relativeBox: { left: 0.03, top: 0.05, width: 0.83, height: 0.11 },
    psm: 7,
  },
  {
    id: "set-code-art-right",
    field: "setCode",
    label: "Set code near art/text boundary",
    relativeBox: { left: 0.58, top: 0.61, width: 0.34, height: 0.095 },
    psm: 7,
    whitelist: SET_CODE_WHITELIST,
  },
  {
    id: "set-code-art-right-tight",
    field: "setCode",
    label: "Tight set code near right art edge",
    relativeBox: { left: 0.64, top: 0.62, width: 0.28, height: 0.07 },
    psm: 7,
    whitelist: SET_CODE_WHITELIST,
  },
  {
    id: "set-code-lower-left",
    field: "setCode",
    label: "Set code in lower-left bottom strip",
    relativeBox: { left: 0.05, top: 0.91, width: 0.36, height: 0.06 },
    psm: 7,
    whitelist: SET_CODE_WHITELIST,
  },
  {
    id: "edition-bottom-left",
    field: "edition",
    label: "Edition text on bottom strip",
    relativeBox: { left: 0.12, top: 0.9, width: 0.34, height: 0.07 },
    psm: 7,
  },
  {
    id: "edition-bottom-wide",
    field: "edition",
    label: "Wide bottom strip edition text",
    relativeBox: { left: 0.04, top: 0.9, width: 0.5, height: 0.08 },
    psm: 7,
  },
  {
    id: "serial-number-bottom-left",
    field: "serialNumber",
    label: "Serial Number on bottom-left strip",
    relativeBox: { left: 0.04, top: 0.9, width: 0.24, height: 0.07 },
    psm: 7,
    whitelist: SERIAL_NUMBER_WHITELIST,
  },
  {
    id: "serial-number-bottom-left-wide",
    field: "serialNumber",
    label: "Wide Serial Number on bottom-left strip",
    relativeBox: { left: 0, top: 0.885, width: 0.34, height: 0.09 },
    psm: 7,
    whitelist: SERIAL_NUMBER_WHITELIST,
  },
];

const BASE_VARIANTS = ["color", "gray-contrast", "threshold"] as const;
const SERIAL_VARIANTS = [...BASE_VARIANTS, "serial-contrast"] as const;

export type PreparedOcrImages = {
  images: PreparedOcrImage[];
  cleanup: () => Promise<void>;
};

export async function prepareOcrImages(
  imagePath: string,
  analysis: CardFrameAnalysis,
): Promise<PreparedOcrImages> {
  const directory = await mkdtemp(join(tmpdir(), "yugioh-ocr-"));
  const images: PreparedOcrImage[] = [];

  try {
    for (const template of REGION_TEMPLATES) {
      const region = regionFromTemplate(template, analysis);

      for (const variantName of variantsForField(region.field)) {
        const targetWidth = targetWidthForField(region.field);
        const targetHeight = Math.max(
          48,
          Math.round((region.sourceBox.height / region.sourceBox.width) * targetWidth),
        );
        const outputPath = join(directory, `${region.id}-${variantName}.png`);
        const pipeline = sharp(imagePath)
          .rotate()
          .extract({
            left: region.sourceBox.left,
            top: region.sourceBox.top,
            width: region.sourceBox.width,
            height: region.sourceBox.height,
          })
          .resize(targetWidth, targetHeight, { fit: "fill" });

        if (variantName === "gray-contrast") {
          await pipeline
            .grayscale()
            .normalize()
            .linear(1.3, -18)
            .sharpen({ sigma: 1 })
            .png()
            .toFile(outputPath);
        } else if (variantName === "threshold") {
          await pipeline
            .grayscale()
            .normalize()
            .linear(1.45, -28)
            .sharpen({ sigma: 1 })
            .threshold(142)
            .png()
            .toFile(outputPath);
        } else if (variantName === "serial-contrast") {
          await pipeline
            .grayscale()
            .normalize()
            .linear(1.8, -70)
            .sharpen({ sigma: 1 })
            .png()
            .toFile(outputPath);
        } else {
          await pipeline
            .modulate({ brightness: 1.06, saturation: 0.65 })
            .normalize()
            .sharpen({ sigma: 1 })
            .png()
            .toFile(outputPath);
        }

        images.push({
          id: `${region.id}:${variantName}`,
          field: region.field,
          region,
          variant: {
            name: variantName,
            path: outputPath,
            width: targetWidth,
            height: targetHeight,
          },
        });
      }
    }

    return {
      images,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function variantsForField(field: OcrField) {
  return field === "serialNumber" ? SERIAL_VARIANTS : BASE_VARIANTS;
}

function regionFromTemplate(
  template: RegionTemplate,
  analysis: CardFrameAnalysis,
): OcrRegion {
  const cardRect = analysis.cardRect;
  const rawBox = {
    left: cardRect.left + cardRect.width * template.relativeBox.left,
    top: cardRect.top + cardRect.height * template.relativeBox.top,
    width: cardRect.width * template.relativeBox.width,
    height: cardRect.height * template.relativeBox.height,
  };
  const padding = Math.max(4, Math.round(Math.min(rawBox.width, rawBox.height) * 0.12));
  const sourceBox = clampBox(
    {
      left: Math.round(rawBox.left - padding),
      top: Math.round(rawBox.top - padding),
      width: Math.round(rawBox.width + padding * 2),
      height: Math.round(rawBox.height + padding * 2),
    },
    analysis.imageWidth,
    analysis.imageHeight,
  );

  return {
    ...template,
    sourceBox,
  };
}

function clampBox(box: OcrBox, imageWidth: number, imageHeight: number): OcrBox {
  const left = Math.max(0, Math.min(imageWidth - 1, box.left));
  const top = Math.max(0, Math.min(imageHeight - 1, box.top));
  const right = Math.max(left + 1, Math.min(imageWidth, box.left + box.width));
  const bottom = Math.max(top + 1, Math.min(imageHeight, box.top + box.height));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function targetWidthForField(field: OcrField) {
  switch (field) {
    case "cardName":
    case "serialNumber":
      return 1400;
    case "setCode":
      return 900;
    case "edition":
      return 1000;
  }
}
