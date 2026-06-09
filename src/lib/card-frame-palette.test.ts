import { describe, expect, it } from "vitest";

import { cardFrameKind, cardFramePalette } from "@/lib/card-frame-palette";

describe("card frame palette", () => {
  it.each([
    ["normal", "Normal Monster", "normal"],
    ["effect", "Effect Monster", "effect"],
    ["fusion", "Fusion Monster", "fusion"],
    ["xyz", "XYZ Monster", "xyz"],
    ["synchro", "Synchro Monster", "synchro"],
    ["ritual", "Ritual Monster", "ritual"],
    ["link", "Link Monster", "link"],
    ["effect_pendulum", "Pendulum Effect Monster", "pendulum"],
    ["trap", "Trap Card", "trap"],
    ["spell", "Spell Card", "spell"],
  ] as const)("maps %s metadata to the %s frame", (frameType, cardType, kind) => {
    expect(cardFrameKind(frameType, cardType)).toBe(kind);
  });

  it("uses browser-valid gradients for every frame face", () => {
    const frameTypes = [
      "normal",
      "effect",
      "fusion",
      "xyz",
      "synchro",
      "ritual",
      "link",
      "effect_pendulum",
      "trap",
      "spell",
    ];

    for (const frameType of frameTypes) {
      const palette = cardFramePalette(frameType, null);

      expect(palette.background).toContain("circle at");
      expect(palette.background).not.toContain("circle_at");
    }
  });

  it("keeps trap and spell frames saturated instead of falling back to grey", () => {
    expect(cardFramePalette("trap", "Trap Card")).toMatchObject({
      frameKind: "trap",
      border: "#8e2f76",
      effectBackground: "#f2dce9",
    });
    expect(cardFramePalette("spell", "Spell Card")).toMatchObject({
      frameKind: "spell",
      border: "#106b66",
      effectBackground: "#dcefed",
    });
  });
});
