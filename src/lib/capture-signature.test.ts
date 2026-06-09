import { describe, expect, it } from "vitest";

import {
  isCapturedSceneResetFrame,
  signatureDistance,
} from "@/lib/capture-signature";

describe("signatureDistance", () => {
  it("counts hex digit movement between two brightness signatures", () => {
    expect(signatureDistance("0123", "0123")).toBe(0);
    expect(signatureDistance("0123", "1129")).toBe(7);
    expect(signatureDistance("0123", "012345")).toBe(2);
  });
});

describe("isCapturedSceneResetFrame", () => {
  it("resets when the camera no longer sees a card-like frame", () => {
    expect(isCapturedSceneResetFrame(null, "0123", 4)).toBe(true);
    expect(
      isCapturedSceneResetFrame({ cardLike: false, signature: "0123" }, "0123", 4),
    ).toBe(true);
  });

  it("keeps the captured state while the same card remains in view", () => {
    expect(
      isCapturedSceneResetFrame({ cardLike: true, signature: "0124" }, "0123", 4),
    ).toBe(false);
  });

  it("resets when a different card-like scene replaces the captured card", () => {
    expect(
      isCapturedSceneResetFrame({ cardLike: true, signature: "89ab" }, "0123", 4),
    ).toBe(true);
  });
});
