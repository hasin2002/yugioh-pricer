import type { CaptureCardRect, CaptureFrameQuality } from "@/lib/capture-quality";

export type OcrField = "cardName" | "setCode" | "edition" | "serialNumber";

export type OcrStatus =
  | "completed"
  | "needs_review"
  | "engine_unavailable"
  | "failed";

export type OcrBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type OcrRegion = {
  id: string;
  field: OcrField;
  label: string;
  relativeBox: OcrBox;
  sourceBox: OcrBox;
  psm: number;
  whitelist?: string;
};

export type OcrPreprocessVariant = {
  name: string;
  path: string;
  width: number;
  height: number;
};

export type PreparedOcrImage = {
  id: string;
  field: OcrField;
  region: OcrRegion;
  variant: OcrPreprocessVariant;
};

export type OcrObservation = {
  text: string;
  confidence: number | null;
  boundingBox?: OcrBox;
};

export type OcrImageResult = {
  imageId: string;
  observations: OcrObservation[];
};

export type OcrEngine = {
  name: string;
  recognize(images: PreparedOcrImage[]): Promise<OcrImageResult[]>;
};

export type OcrCandidate = {
  text: string;
  confidence: number | null;
  regionId: string;
  variantName: string;
};

export type CardFrameAnalysis = CaptureFrameQuality & {
  imageWidth: number;
  imageHeight: number;
};

export type OcrSourceRegions = {
  engineName: string | null;
  cardAnalysis: CardFrameAnalysis;
  cardRect: CaptureCardRect;
  regions: Array<{
    id: string;
    field: OcrField;
    label: string;
    relativeBox: OcrBox;
    sourceBox: OcrBox;
    variants: Array<{
      name: string;
      observations: OcrObservation[];
    }>;
  }>;
  error?: string;
};

export type OcrPipelineResult = {
  status: OcrStatus;
  rawText: string | null;
  cardNameText: string | null;
  cardNameConfidence: number | null;
  setCodeText: string | null;
  setCodeConfidence: number | null;
  editionText: string | null;
  editionConfidence: number | null;
  serialNumberText: string | null;
  serialNumberConfidence: number | null;
  sourceRegions: OcrSourceRegions;
};
