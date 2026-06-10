import { describe, expect, it } from "vitest";

import {
  extractOcrCandidates,
  serialNumberCandidates,
  setCodeCandidates,
} from "@/server/ocr/candidates";
import type { PreparedOcrImage } from "@/server/ocr/types";

describe("setCodeCandidates", () => {
  it("normalizes common OCR mistakes in the numeric suffix", () => {
    expect(setCodeCandidates("BLCR-ENO22")).toContain("BLCR-EN022");
  });

  it("rejects short text-fragment matches from non-set-code regions", () => {
    expect(setCodeCandidates("Token is in the N15 Special Summon")).toEqual([]);
    expect(setCodeCandidates("TOK-EN15")).toEqual([]);
  });
});

describe("serialNumberCandidates", () => {
  it("extracts only full 8-digit Serial Number candidates", () => {
    expect(serialNumberCandidates("58415502 1st Edition")).toEqual(["58415502"]);
    expect(serialNumberCandidates("41556 1st Edition")).toEqual([]);
  });
});

describe("extractOcrCandidates", () => {
  it("extracts field candidates from OCR region observations", () => {
    const images = [
      preparedImage("title-band:gray-contrast", "cardName", "title-band"),
      preparedImage("set-code-art-right:gray-contrast", "setCode", "set-code-art-right"),
      preparedImage("edition-bottom-wide:gray-contrast", "edition", "edition-bottom-wide"),
      preparedImage(
        "serial-number-bottom-left:gray-contrast",
        "serialNumber",
        "serial-number-bottom-left",
      ),
    ];

    const result = extractOcrCandidates(images, [
      {
        imageId: "title-band:gray-contrast",
        observations: [{ text: "CRYSTAL SKULL", confidence: 91 }],
      },
      {
        imageId: "set-code-art-right:gray-contrast",
        observations: [{ text: "BLCR-ENO22", confidence: 78 }],
      },
      {
        imageId: "edition-bottom-wide:gray-contrast",
        observations: [{ text: "273572 1* Edition", confidence: 69 }],
      },
      {
        imageId: "serial-number-bottom-left:gray-contrast",
        observations: [{ text: "58415502 1st Edition", confidence: 92 }],
      },
    ]);

    expect(result.cardNameText).toBe("CRYSTAL SKULL");
    expect(result.setCodeText).toBe("BLCR-EN022");
    expect(result.editionText).toBe("1st Edition");
    expect(result.serialNumberText).toBe("58415502");
    expect(result.serialNumberConfidence).toBe(80);
    expect(result.rawText).toContain("[title-band gray-contrast]");
  });

  it("cleans OCR noise from title regions that include card type fragments", () => {
    const images = [
      preparedImage("title-band:color", "cardName", "title-band"),
      preparedImage("title-band:gray-contrast", "cardName", "title-band"),
    ];

    expect(
      extractOcrCandidates(images, [
        {
          imageId: "title-band:color",
          observations: [{ text: "SALAMANGREAT CIRCLE 0 [SPELL CARD3", confidence: 88 }],
        },
        {
          imageId: "title-band:gray-contrast",
          observations: [{ text: "TOOL BOx SPEO", confidence: 82 }],
        },
      ]).cardNameText,
    ).toBe("SALAMANGREAT CIRCLE");

    expect(
      extractOcrCandidates([preparedImage("title-band:color", "cardName", "title-band")], [
        {
          imageId: "title-band:color",
          observations: [{ text: "TOOL BOx SPEO", confidence: 82 }],
        },
      ]).cardNameText,
    ).toBe("TOOL Box");
  });
});

function preparedImage(
  id: PreparedOcrImage["id"],
  field: PreparedOcrImage["field"],
  regionId: string,
): PreparedOcrImage {
  return {
    id,
    field,
    region: {
      id: regionId,
      field,
      label: regionId,
      psm: 7,
      relativeBox: { left: 0, top: 0, width: 1, height: 1 },
      sourceBox: { left: 0, top: 0, width: 100, height: 30 },
    },
    variant: {
      name: "gray-contrast",
      path: `/tmp/${id}.png`,
      width: 100,
      height: 30,
    },
  };
}
