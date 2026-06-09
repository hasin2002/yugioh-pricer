import { describe, expect, it } from "vitest";

import { captureFrameQuality, captureGuideRect } from "@/lib/capture-quality";

function pixels(width: number, height: number, fill: number) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill;
    data[index + 1] = fill;
    data[index + 2] = fill;
    data[index + 3] = 255;
  }

  return data;
}

function fillRect(
  data: Uint8ClampedArray,
  width: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  value: number,
) {
  const boundedLeft = Math.max(0, left);
  const boundedTop = Math.max(0, top);
  const boundedRight = Math.min(width, right);
  const boundedBottom = Math.min(data.length / width / 4, bottom);

  for (let y = boundedTop; y < boundedBottom; y += 1) {
    for (let x = boundedLeft; x < boundedRight; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
}

describe("captureFrameQuality", () => {
  it("rejects a bright but featureless stable background", () => {
    const width = 240;
    const height = 360;
    const data = pixels(width, height, 170);

    const quality = captureFrameQuality({ data, width, height });

    expect(quality.brightness).toBeGreaterThan(100);
    expect(quality.cardLike).toBe(false);
    expect(quality.matchedEdges).toBe(0);
  });

  it("rejects one strong background line without a card-shaped rectangle", () => {
    const width = 240;
    const height = 360;
    const data = pixels(width, height, 160);

    fillRect(data, width, 0, 80, width, 96, 40);

    const quality = captureFrameQuality({ data, width, height });

    expect(quality.cardLike).toBe(false);
    expect(quality.matchedEdges).toBeLessThan(3);
  });

  it("rejects a cutting mat grid without a card-sized rectangle", () => {
    const width = 240;
    const height = 360;
    const data = pixels(width, height, 95);

    for (let x = 0; x < width; x += 18) {
      fillRect(data, width, x, 0, x + 2, height, 190);
    }

    for (let y = 0; y < height; y += 18) {
      fillRect(data, width, 0, y, width, y + 2, 190);
    }

    for (let offset = -120; offset < width; offset += 1) {
      fillRect(data, width, offset, offset + 170, offset + 4, offset + 174, 55);
    }

    const quality = captureFrameQuality({ data, width, height });

    expect(quality.cardLike).toBe(false);
  });

  it("accepts a centered portrait card shape inside the capture guide", () => {
    const width = 240;
    const height = 360;
    const data = pixels(width, height, 80);
    const guide = captureGuideRect(width, height);

    fillRect(
      data,
      width,
      guide.left,
      guide.top,
      guide.right,
      guide.bottom,
      205,
    );

    const quality = captureFrameQuality({ data, width, height });

    expect(quality.cardLike).toBe(true);
    expect(quality.matchedEdges).toBe(4);
  });

  it("accepts card-like art and text texture even when the border is offset", () => {
    const width = 240;
    const height = 360;
    const data = pixels(width, height, 95);
    const guide = captureGuideRect(width, height);

    fillRect(
      data,
      width,
      guide.left - 10,
      guide.top - 14,
      guide.right + 12,
      guide.bottom + 16,
      175,
    );

    for (let row = 0; row < 12; row += 1) {
      const y = guide.top + 28 + row * 14;
      fillRect(data, width, guide.left + 18, y, guide.right - 18, y + 5, 55);
    }

    for (let column = 0; column < 6; column += 1) {
      const x = guide.left + 28 + column * 18;
      fillRect(data, width, x, guide.top + 80, x + 10, guide.top + 170, 220);
    }

    const quality = captureFrameQuality({ data, width, height });

    expect(quality.cardLike).toBe(true);
    expect(quality.textureScore).toBeGreaterThan(18);
  });
});
