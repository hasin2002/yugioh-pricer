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
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
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
});
