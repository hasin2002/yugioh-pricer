import { describe, expect, it } from "vitest";

import {
  capturedSceneResetKind,
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

describe("capturedSceneResetKind", () => {
  it("does not reset from missing frames or minor movement", () => {
    expect(capturedSceneResetKind(null, "0123", 4)).toBeNull();
    expect(
      capturedSceneResetKind({ cardLike: true, signature: "0124" }, "0123", 4),
    ).toBeNull();
    expect(
      capturedSceneResetKind({ cardLike: false, signature: "0123" }, "0123", 4),
    ).toBeNull();
  });

  it("recognizes when the scanned card leaves the guide", () => {
    expect(
      capturedSceneResetKind({ cardLike: false, signature: "89ab" }, "0123", 4),
    ).toBe("card_removed");
  });

  it("recognizes a different card revealed in the guide", () => {
    expect(
      capturedSceneResetKind({ cardLike: true, signature: "89ab" }, "0123", 4),
    ).toBe("different_card");
  });
});

describe("isCapturedSceneResetFrame", () => {
  it("does not reset from missing frames or minor non-card-like movement", () => {
    expect(isCapturedSceneResetFrame(null, "0123", 4)).toBe(false);
    expect(
      isCapturedSceneResetFrame({ cardLike: false, signature: "0123" }, "0123", 4),
    ).toBe(false);
  });

  it("keeps the captured state while the same card remains in view", () => {
    expect(
      isCapturedSceneResetFrame({ cardLike: true, signature: "0124" }, "0123", 4),
    ).toBe(false);
  });

  it("resets when the scene changes substantially after capture", () => {
    expect(
      isCapturedSceneResetFrame({ cardLike: true, signature: "89ab" }, "0123", 4),
    ).toBe(true);
    expect(
      isCapturedSceneResetFrame({ cardLike: false, signature: "89ab" }, "0123", 4),
    ).toBe(true);
  });
});
