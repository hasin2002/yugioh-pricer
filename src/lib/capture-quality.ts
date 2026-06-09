export type CaptureFrameQuality = {
  brightness: number;
  cardLike: boolean;
  edgeScore: number;
  matchedEdges: number;
  signature: string;
  structureScore: number;
  textureScore: number;
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
const MIN_BRIGHTNESS = 18;
const MIN_MATCHED_EDGES = 3;
const STRUCTURE_CONTRAST_THRESHOLD = 16;
const MIN_STRUCTURE_MATCHES = 3;
const MIN_TEXTURE_SCORE = 18;

type Rect = ReturnType<typeof captureGuideRect>;

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
  const candidate = bestCardCandidate(source);
  const matchedEdges = candidate.edges.filter(
    (score) => score >= EDGE_CONTRAST_THRESHOLD,
  ).length;
  const edgeScore =
    candidate.edges.reduce((total, score) => total + score, 0) /
    Math.max(1, candidate.edges.length);
  const textureScore = guideTextureScore(source);

  return {
    ...sample,
    cardLike:
      sample.brightness >= MIN_BRIGHTNESS &&
      matchedEdges >= MIN_MATCHED_EDGES &&
      candidate.structureMatches >= MIN_STRUCTURE_MATCHES &&
      textureScore >= MIN_TEXTURE_SCORE,
    edgeScore,
    matchedEdges,
    structureScore: candidate.structureScore,
    textureScore,
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

function bestCardCandidate(source: PixelSource) {
  let bestCandidate = {
    edges: [0, 0, 0, 0],
    structureMatches: 0,
    structureScore: 0,
  };
  let bestMatchedEdges = 0;
  let bestCandidateScore = 0;

  for (const rect of candidateCardRects(source.width, source.height)) {
    const edges = cardRectEdgeContrasts(source, rect);
    const matchedEdges = edges.filter((score) => score >= EDGE_CONTRAST_THRESHOLD)
      .length;
    const structure = cardStructureScore(source, rect);
    const score =
      matchedEdges * 100 +
      structure.matches * 80 +
      edges.reduce((total, edge) => total + edge, 0) +
      structure.score;

    if (
      matchedEdges > bestMatchedEdges ||
      (matchedEdges === bestMatchedEdges && score > bestCandidateScore)
    ) {
      bestCandidate = {
        edges,
        structureMatches: structure.matches,
        structureScore: structure.score,
      };
      bestMatchedEdges = matchedEdges;
      bestCandidateScore = score;
    }
  }

  return bestCandidate;
}

function candidateCardRects(width: number, height: number) {
  const guide = captureGuideRect(width, height);
  const widthScales = [0.82, 0.88, 0.94, 1];
  const xShifts = [-0.06, 0, 0.06];
  const yShifts = [-0.06, 0, 0.06];

  return widthScales.flatMap((widthScale) => {
    const rectWidth = guide.width * widthScale;
    const rectHeight = Math.min(guide.height, rectWidth / CARD_ASPECT_RATIO);

    return xShifts.flatMap((xShift) =>
      yShifts.map((yShift) => {
        const centerX = (guide.left + guide.right) / 2 + guide.width * xShift;
        const centerY = (guide.top + guide.bottom) / 2 + guide.height * yShift;
        const left = Math.round(
          Math.max(0, Math.min(width - rectWidth, centerX - rectWidth / 2)),
        );
        const top = Math.round(
          Math.max(0, Math.min(height - rectHeight, centerY - rectHeight / 2)),
        );

        return {
          left,
          top,
          right: Math.round(left + rectWidth),
          bottom: Math.round(top + rectHeight),
          width: Math.round(rectWidth),
          height: Math.round(rectHeight),
        };
      }),
    );
  });
}

function cardRectEdgeContrasts(source: PixelSource, rect: Rect) {
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

function cardStructureScore(source: PixelSource, rect: Rect) {
  const scores = [
    horizontalInternalContrast(source, rect, 0.16, 0.12, 0.88),
    horizontalInternalContrast(source, rect, 0.34, 0.14, 0.86),
    horizontalInternalContrast(source, rect, 0.62, 0.14, 0.86),
    horizontalInternalContrast(source, rect, 0.75, 0.12, 0.88),
    horizontalInternalContrast(source, rect, 0.9, 0.12, 0.88),
    verticalInternalContrast(source, rect, 0.14, 0.26, 0.64),
    verticalInternalContrast(source, rect, 0.86, 0.26, 0.64),
  ];
  const matches = scores.filter((score) => score >= STRUCTURE_CONTRAST_THRESHOLD)
    .length;

  return {
    matches,
    score: scores.reduce((total, score) => total + score, 0),
  };
}

function horizontalInternalContrast(
  source: PixelSource,
  rect: Rect,
  relativeY: number,
  relativeLeft: number,
  relativeRight: number,
) {
  const edgeY = rect.top + rect.height * relativeY;
  const left = rect.left + rect.width * relativeLeft;
  const right = rect.left + rect.width * relativeRight;
  const offset = Math.max(2, Math.round(rect.height * 0.012));

  return horizontalEdgeContrast(source, edgeY, left, right, offset);
}

function verticalInternalContrast(
  source: PixelSource,
  rect: Rect,
  relativeX: number,
  relativeTop: number,
  relativeBottom: number,
) {
  const edgeX = rect.left + rect.width * relativeX;
  const top = rect.top + rect.height * relativeTop;
  const bottom = rect.top + rect.height * relativeBottom;
  const offset = Math.max(2, Math.round(rect.width * 0.012));

  return verticalEdgeContrast(source, edgeX, top, bottom, offset);
}

function guideTextureScore(source: PixelSource) {
  const rect = captureGuideRect(source.width, source.height);
  const columns = 10;
  const rows = 14;
  const samples: number[][] = [];

  for (let row = 0; row < rows; row += 1) {
    const sampleRow: number[] = [];

    for (let column = 0; column < columns; column += 1) {
      const x = rect.left + (rect.width * (column + 0.5)) / columns;
      const y = rect.top + (rect.height * (row + 0.5)) / rows;
      sampleRow.push(luminanceAt(source, x, y));
    }

    samples.push(sampleRow);
  }

  let total = 0;
  let comparisons = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (column + 1 < columns) {
        total += Math.abs(samples[row]![column]! - samples[row]![column + 1]!);
        comparisons += 1;
      }

      if (row + 1 < rows) {
        total += Math.abs(samples[row]![column]! - samples[row + 1]![column]!);
        comparisons += 1;
      }
    }
  }

  return total / Math.max(1, comparisons);
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
