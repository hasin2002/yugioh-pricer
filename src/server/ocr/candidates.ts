import type {
  OcrCandidate,
  OcrImageResult,
  OcrPipelineResult,
  PreparedOcrImage,
} from "@/server/ocr/types";

type CandidateFields = Pick<
  OcrPipelineResult,
  | "rawText"
  | "cardNameText"
  | "cardNameConfidence"
  | "setCodeText"
  | "setCodeConfidence"
  | "editionText"
  | "editionConfidence"
  | "serialNumberText"
  | "serialNumberConfidence"
>;

export function extractOcrCandidates(
  images: PreparedOcrImage[],
  results: OcrImageResult[],
): CandidateFields {
  const resultByImageId = new Map(
    results.map((result) => [result.imageId, result]),
  );
  const candidates = {
    cardName: [] as OcrCandidate[],
    setCode: [] as OcrCandidate[],
    edition: [] as OcrCandidate[],
    serialNumber: [] as OcrCandidate[],
  };
  const rawSections: string[] = [];

  for (const image of images) {
    const result = resultByImageId.get(image.id);
    const text = observationText(result);

    if (!text) {
      continue;
    }

    rawSections.push(
      `[${image.region.id} ${image.variant.name}]\n${text}`,
    );

    const confidence = averageConfidence(result);

    switch (image.field) {
      case "cardName": {
        const cardName = cardNameCandidate(text);

        if (cardName) {
          candidates.cardName.push(candidate(cardName, confidence, image));
        }
        break;
      }
      case "setCode": {
        for (const setCode of setCodeCandidates(text)) {
          candidates.setCode.push(candidate(setCode, confidence, image));
        }
        break;
      }
      case "edition": {
        const edition = editionCandidate(text);

        if (edition) {
          candidates.edition.push(candidate(edition, confidence, image));
        }
        break;
      }
      case "serialNumber": {
        for (const serialNumber of serialNumberCandidates(text)) {
          candidates.serialNumber.push(
            candidate(serialNumber, serialNumberConfidence(confidence), image),
          );
        }
        break;
      }
    }
  }

  const cardName = bestCandidate(candidates.cardName);
  const setCode = bestCandidate(candidates.setCode);
  const edition = bestCandidate(candidates.edition);
  const serialNumber = bestCandidate(candidates.serialNumber, {
    preferLength: true,
  });

  return {
    rawText: rawSections.length > 0 ? rawSections.join("\n\n").slice(0, 12000) : null,
    cardNameText: cardName?.text ?? null,
    cardNameConfidence: roundedConfidence(cardName),
    setCodeText: setCode?.text ?? null,
    setCodeConfidence: roundedConfidence(setCode),
    editionText: edition?.text ?? null,
    editionConfidence: roundedConfidence(edition),
    serialNumberText: serialNumber?.text ?? null,
    serialNumberConfidence: roundedConfidence(serialNumber),
  };
}

function observationText(result: OcrImageResult | undefined) {
  return (
    result?.observations
      .map((observation) => observation.text.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

function averageConfidence(result: OcrImageResult | undefined) {
  const confidences =
    result?.observations
      .map((observation) => observation.confidence)
      .filter((confidence): confidence is number => confidence !== null) ?? [];

  if (confidences.length === 0) {
    return null;
  }

  return (
    confidences.reduce((total, confidence) => total + confidence, 0) /
    confidences.length
  );
}

function candidate(
  text: string,
  confidence: number | null,
  image: PreparedOcrImage,
): OcrCandidate {
  return {
    text,
    confidence,
    regionId: image.region.id,
    variantName: image.variant.name,
  };
}

function cardNameCandidate(text: string) {
  const normalized = text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\bI?(SPELL|TRAP)\s+CARD[A-Z0-9]?\b.*$/gi, " ")
    .replace(/\b(LIGHT|DARK|WATER|FIRE|EARTH|WIND)\b$/gi, " ")
    .replace(/[^A-Z0-9 .,'’:&!?-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cleaned = removeTrailingIconNoise(normalized)
    .replace(/[!?.:,;]+$/g, "")
    .trim();

  if (
    cleaned.length < 3 ||
    /\b(EFFECT|FUSION|SYNCHRO|XYZ|LINK)\b/i.test(cleaned) ||
    /^SPE(?!ED)[A-Z0-9]*\b/i.test(cleaned)
  ) {
    return null;
  }

  return titleCaseAcronyms(cleaned);
}

export function setCodeCandidates(text: string) {
  const normalized = text
    .toUpperCase()
    .replace(/[—–_]/g, "-")
    .replace(/[^A-Z0-9.\-\s]/g, " ");
  const candidates = new Set<string>();
  const pattern =
    /(?:^|[^A-Z0-9])([A-Z0-9]{2,6})\s*[-.]?\s*EN\s*([A-Z0-9]{3,5})(?=$|[^A-Z0-9])/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalized)) !== null) {
    const prefix = match[1]!;
    const suffix = match[2]!
      .replace(/[OQD]/g, "0")
      .replace(/[IL]/g, "1")
      .replace(/S/g, "5");

    if (/^\d{3,5}$/.test(suffix)) {
      candidates.add(`${prefix}-EN${suffix}`);
    }
  }

  return [...candidates];
}

function editionCandidate(text: string) {
  const normalized = text
    .replace(/1\s*[*|]\s*/g, "1st ")
    .replace(/[|*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/\b(limited|limlted|limi[tf]ed)\s+edition\b/i.test(normalized)) {
    return "Limited Edition";
  }

  if (/\b(1st|lst|ist|1\s*st|1)\s+edition\b/i.test(normalized)) {
    return "1st Edition";
  }

  return null;
}

export function serialNumberCandidates(text: string) {
  const normalized = text
    .toUpperCase()
    .replace(/[OQD]/g, "0")
    .replace(/[IL|]/g, "1")
    .replace(/S/g, "5");
  const candidates = new Set<string>();
  const pattern = /\d{8}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(normalized)) !== null) {
    const value = match[0]!;

    if (!/^0+$/.test(value)) {
      candidates.add(value);
    }
  }

  return [...candidates].sort((left, right) => right.length - left.length);
}

function serialNumberConfidence(confidence: number | null) {
  if (confidence === null) {
    return null;
  }

  return Math.min(confidence, 80);
}

function bestCandidate(
  candidates: OcrCandidate[],
  options: { preferLength?: boolean } = {},
) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      score:
        (candidate.confidence ?? 45) +
        Math.min(24, candidate.text.length * (options.preferLength ? 2 : 1)) +
        variantScore(candidate.variantName),
    }))
    .sort((left, right) => right.score - left.score)[0];
}

function variantScore(variantName: string) {
  if (variantName === "gray-contrast") {
    return 4;
  }

  if (variantName === "color") {
    return 3;
  }

  if (variantName === "threshold") {
    return -8;
  }

  return 0;
}

function removeTrailingIconNoise(value: string) {
  const words = value.split(" ");

  if (words.length > 1) {
    const lastWord = words[words.length - 1]!;
    const precedingUppercaseWords = words
      .slice(0, -1)
      .filter((word) => word.length > 1 && word === word.toUpperCase()).length;

    if (
      precedingUppercaseWords > 0 &&
      lastWord.length > 4 &&
      lastWord === lastWord.toUpperCase() &&
      lastWord.endsWith("I")
    ) {
      words[words.length - 1] = lastWord.slice(0, -1);
    }
  }

  while (words.length > 1) {
    const lastWord = words[words.length - 1]!;
    const uppercaseWords = words
      .slice(0, -1)
      .filter((word) => word.length > 1 && word === word.toUpperCase()).length;
    const mostlyUppercaseTitle = uppercaseWords >= Math.max(1, words.length - 2);
    const noisyTrailingWord =
      /^[A-Z]$/.test(lastWord) ||
      (/^\d$/.test(lastWord) && uppercaseWords >= 2) ||
      (/[a-z]/.test(lastWord) && uppercaseWords >= 2) ||
      /^SPE[A-Z]*$/.test(lastWord) ||
      /^CARD[A-Z]?$/.test(lastWord);

    if (!mostlyUppercaseTitle || !noisyTrailingWord) {
      break;
    }

    words.pop();
  }

  return words.join(" ");
}

function roundedConfidence(candidate: OcrCandidate | undefined) {
  return candidate?.confidence === null || candidate?.confidence === undefined
    ? null
    : Math.round(candidate.confidence);
}

function titleCaseAcronyms(value: string) {
  return value
    .split(" ")
    .map((word) => {
      if (/^[A-Z0-9.:-]+$/.test(word)) {
        return word;
      }

      return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}
