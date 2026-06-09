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
  const boundedLeft = Math.max(0, Math.floor(left));
  const boundedTop = Math.max(0, Math.floor(top));
  const boundedRight = Math.min(width, Math.ceil(right));
  const boundedBottom = Math.min(data.length / width / 4, Math.ceil(bottom));

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

function drawCard(
  data: Uint8ClampedArray,
  width: number,
  rect: ReturnType<typeof captureGuideRect>,
  fill = 175,
) {
  fillRect(data, width, rect.left, rect.top, rect.right, rect.bottom, fill);
  fillRect(
    data,
    width,
    rect.left + rect.width * 0.1,
    rect.top + rect.height * 0.12,
    rect.right - rect.width * 0.1,
    rect.top + rect.height * 0.18,
    55,
  );
  fillRect(
    data,
    width,
    rect.left + rect.width * 0.14,
    rect.top + rect.height * 0.28,
    rect.right - rect.width * 0.14,
    rect.top + rect.height * 0.62,
    65,
  );
  fillRect(
    data,
    width,
    rect.left + rect.width * 0.12,
    rect.top + rect.height * 0.74,
    rect.right - rect.width * 0.12,
    rect.top + rect.height * 0.9,
    230,
  );
  fillRect(
    data,
    width,
    rect.left + rect.width * 0.14,
    rect.top + rect.height * 0.3,
    rect.left + rect.width * 0.18,
    rect.top + rect.height * 0.62,
    220,
  );
  fillRect(
    data,
    width,
    rect.right - rect.width * 0.18,
    rect.top + rect.height * 0.3,
    rect.right - rect.width * 0.14,
    rect.top + rect.height * 0.62,
    220,
  );
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

  it("rejects a rectangular leaflet with text but no card layout", () => {
    const width = 240;
    const height = 360;
    const data = pixels(width, height, 145);
    const guide = captureGuideRect(width, height);

    fillRect(
      data,
      width,
      guide.left + 8,
      guide.top + 80,
      guide.right - 8,
      guide.bottom - 52,
      35,
    );

    for (let row = 0; row < 6; row += 1) {
      const y = guide.top + 172 + row * 10;
      fillRect(data, width, guide.left + 28, y, guide.right - 30, y + 4, 230);
    }

    const quality = captureFrameQuality({ data, width, height });

    expect(quality.cardLike).toBe(false);
  });

  it("rejects a card that is only partly entering the capture guide", () => {
    const width = 240;
    const height = 360;
    const data = pixels(width, height, 95);
    const guide = captureGuideRect(width, height);
    const cardWidth = guide.width * 0.72;
    const cardHeight = cardWidth / (59 / 86);

    drawCard(data, width, {
      left: guide.left - cardWidth * 0.42,
      top: guide.top + guide.height * 0.2,
      right: guide.left + cardWidth * 0.58,
      bottom: guide.top + guide.height * 0.2 + cardHeight,
      width: cardWidth,
      height: cardHeight,
    });

    const quality = captureFrameQuality({ data, width, height });

    expect(quality.cardLike).toBe(false);
  });

  it("rejects a cluttered mat and notebook scene without a full card", () => {
    const width = 240;
    const height = 360;
    const data = pixels(width, height, 92);
    const guide = captureGuideRect(width, height);

    for (let x = 0; x < width; x += 18) {
      fillRect(data, width, x, 0, x + 2, height, 188);
    }

    for (let y = 0; y < height; y += 18) {
      fillRect(data, width, 0, y, width, y + 2, 188);
    }

    fillRect(
      data,
      width,
      guide.left + guide.width * 0.2,
      guide.top + guide.height * 0.08,
      guide.right + guide.width * 0.24,
      guide.top + guide.height * 0.28,
      225,
    );

    for (let row = 0; row < 6; row += 1) {
      const y = guide.top + guide.height * 0.12 + row * 8;
      fillRect(data, width, guide.left + 52, y, guide.right + 26, y + 2, 145);
    }

    for (let offset = -36; offset < width; offset += 1) {
      fillRect(data, width, offset, offset + 170, offset + 5, offset + 175, 45);
    }

    const quality = captureFrameQuality({ data, width, height });

    expect(quality.cardLike).toBe(false);
  });

  it("accepts a centered portrait card shape inside the capture guide", () => {
    const width = 240;
    const height = 360;
    const data = pixels(width, height, 80);
    const guide = captureGuideRect(width, height);

    drawCard(data, width, guide, 205);

    const quality = captureFrameQuality({ data, width, height });

    expect(quality.cardLike).toBe(true);
    expect(quality.matchedEdges).toBe(4);
  });

  it("accepts a slightly off-center card inside the capture guide", () => {
    const width = 240;
    const height = 360;
    const data = pixels(width, height, 95);
    const guide = captureGuideRect(width, height);

    drawCard(data, width, {
      left: guide.left + 12,
      top: guide.top + 8,
      right: guide.right - 6,
      bottom: guide.bottom - 18,
      width: guide.width - 18,
      height: guide.height - 26,
    });

    const quality = captureFrameQuality({ data, width, height });

    expect(quality.cardLike).toBe(true);
    expect(quality.textureScore).toBeGreaterThan(18);
  });
});
