import { describe, expect, it } from "vitest";

import { shouldDiscardNoCardCapture } from "@/server/ocr/card-analysis";
import type { CandidateFrameMetrics } from "@/server/capture/burst";
import type { CardFrameAnalysis } from "@/server/ocr/types";

describe("shouldDiscardNoCardCapture", () => {
  it("discards only when client and server both see no card", () => {
    expect(
      shouldDiscardNoCardCapture(serverAnalysis({ cardLike: false }), [
        metric(false),
        metric(false),
        metric(false),
        metric(false),
      ]),
    ).toBe(true);
  });

  it("keeps uncertain captures reviewable when any client frame looked card-like", () => {
    expect(
      shouldDiscardNoCardCapture(serverAnalysis({ cardLike: false }), [
        metric(false),
        metric(true),
        metric(false),
        metric(false),
      ]),
    ).toBe(false);
  });

  it("keeps server-uncertain no-card captures reviewable", () => {
    expect(
      shouldDiscardNoCardCapture(
        serverAnalysis({
          cardLike: false,
          matchedEdges: 3,
          structureScore: 130,
        }),
        [metric(false), metric(false), metric(false), metric(false)],
      ),
    ).toBe(false);
  });
});

function metric(cardLike: boolean): CandidateFrameMetrics {
  return {
    cardLike,
    brightness: 90,
    signature: "abc",
  };
}

function serverAnalysis(
  overrides: Partial<CardFrameAnalysis> = {},
): CardFrameAnalysis {
  return {
    brightness: 100,
    cardLike: false,
    cardRect: { left: 10, top: 20, right: 210, bottom: 320, width: 200, height: 300 },
    edgeScore: 10,
    matchedEdges: 1,
    signature: "server",
    structureScore: 50,
    textureScore: 10,
    imageWidth: 240,
    imageHeight: 360,
    ...overrides,
  };
}
