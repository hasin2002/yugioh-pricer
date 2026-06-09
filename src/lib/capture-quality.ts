export type CaptureFrameQuality = {
  brightness: number;
  cardLike: boolean;
  edgeScore: number;
  matchedEdges: number;
  signature: string;
};

type PixelSource = {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
};

const CARD_ASPECT_RATIO = 59 / 86;
const GUIDE_HEIGHT_RATIO = 0.72;
const GUIDE_WIDTH_RATIO = 0.78;
const EDGE_SAMPLE_COUNT = 28;
const EDGE_INSET_RATIO = 0.025;
const EDGE_CONTRAST_THRESHOLD = 24;
const MIN_MATCHED_EDGES = 3;
const MIN_BRIGHTNESS = 18;

export function captureGuideRect(width: number, height: number) {
  let guideHeight = height * GUIDE_HEIGHT_RATIO;
  let guideWidth = guideHeight * CARD_ASPECT_RATIO;
  const maxGuideWidth = width * GUIDE_WIDTH_RATIO;

  if (guideWidth > maxGuideWidth) {
    guideWidth = maxGuideWidth;
    guideHeight = guideWidth / CARD_ASPECT_RATIO;
  }

  const left = Math.round((width - guideWidth) / 2);
  const top = Math.round((height - guideHeight) / 2);

  return {
    left,
    top,
    right: Math.round(left + guideWidth),
    bottom: Math.round(top + guideHeight),
    width: Math.round(guideWidth),
    height: Math.round(guideHeight),
  };
}

export function captureFrameQuality(source: PixelSource): CaptureFrameQuality {
  const sample = brightnessSignature(source);
  const edges = guideEdgeContrasts(source);
  const matchedEdges = edges.filter((score) => score >= EDGE_CONTRAST_THRESHOLD)
    .length;
  const edgeScore =
    edges.reduce((total, score) => total + score, 0) / Math.max(1, edges.length);

  return {
    ...sample,
    cardLike: sample.brightness >= MIN_BRIGHTNESS && matchedEdges >= MIN_MATCHED_EDGES,
    edgeScore,
    matchedEdges,
  };
}

function brightnessSignature(source: PixelSource) {
  const sampleSize = 8;
  const stepX = Math.max(1, Math.floor(source.width / sampleSize));
  const stepY = Math.max(1, Math.floor(source.height / sampleSize));
  const values: number[] = [];
  let total = 0;

  for (let y = Math.floor(stepY / 2); y < source.height; y += stepY) {
    for (let x = Math.floor(stepX / 2); x < source.width; x += stepX) {
      const value = luminanceAt(source, x, y);
      values.push(value);
      total += value;
    }
  }

  return {
    brightness: values.length > 0 ? total / values.length : 0,
    signature: values
      .map((value) => Math.round(value / 16).toString(16))
      .join(""),
  };
}

function guideEdgeContrasts(source: PixelSource) {
  const rect = captureGuideRect(source.width, source.height);
  const inset = Math.max(
    2,
    Math.round(Math.min(rect.width, rect.height) * EDGE_INSET_RATIO),
  );

  return [
    verticalEdgeContrast(source, rect.left, rect.top, rect.bottom, inset),
    verticalEdgeContrast(source, rect.right, rect.top, rect.bottom, -inset),
    horizontalEdgeContrast(source, rect.top, rect.left, rect.right, inset),
    horizontalEdgeContrast(source, rect.bottom, rect.left, rect.right, -inset),
  ];
}

function verticalEdgeContrast(
  source: PixelSource,
  edgeX: number,
  top: number,
  bottom: number,
  innerOffset: number,
) {
  let total = 0;

  for (let index = 0; index < EDGE_SAMPLE_COUNT; index += 1) {
    const y = Math.round(top + ((bottom - top) * (index + 0.5)) / EDGE_SAMPLE_COUNT);
    const inside = luminanceAt(source, edgeX + innerOffset, y);
    const outside = luminanceAt(source, edgeX - innerOffset, y);
    total += Math.abs(inside - outside);
  }

  return total / EDGE_SAMPLE_COUNT;
}

function horizontalEdgeContrast(
  source: PixelSource,
  edgeY: number,
  left: number,
  right: number,
  innerOffset: number,
) {
  let total = 0;

  for (let index = 0; index < EDGE_SAMPLE_COUNT; index += 1) {
    const x = Math.round(left + ((right - left) * (index + 0.5)) / EDGE_SAMPLE_COUNT);
    const inside = luminanceAt(source, x, edgeY + innerOffset);
    const outside = luminanceAt(source, x, edgeY - innerOffset);
    total += Math.abs(inside - outside);
  }

  return total / EDGE_SAMPLE_COUNT;
}

function luminanceAt(source: PixelSource, x: number, y: number) {
  const boundedX = Math.max(0, Math.min(source.width - 1, Math.round(x)));
  const boundedY = Math.max(0, Math.min(source.height - 1, Math.round(y)));
  const offset = (boundedY * source.width + boundedX) * 4;
  const red = source.data[offset] ?? 0;
  const green = source.data[offset + 1] ?? 0;
  const blue = source.data[offset + 2] ?? 0;

  return Math.round((red + green + blue) / 3);
}
