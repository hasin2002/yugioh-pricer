import { describe, expect, it } from "vitest";

import { captureStateLabel, captureStateTone } from "@/lib/capture-state";

describe("captureStateLabel", () => {
  it("names the user-facing capture stages", () => {
    expect(captureStateLabel("detecting")).toBe("Detecting");
    expect(captureStateLabel("hold_steady")).toBe("Hold steady");
    expect(captureStateLabel("uploading")).toBe("Uploading");
    expect(captureStateLabel("captured")).toBe("Captured");
  });
});

describe("captureStateTone", () => {
  it("uses distinct color families for primary capture stages", () => {
    const primaryStagePanels = [
      captureStateTone("detecting").panelClassName,
      captureStateTone("hold_steady").panelClassName,
      captureStateTone("uploading").panelClassName,
      captureStateTone("captured").panelClassName,
    ];

    expect(new Set(primaryStagePanels).size).toBe(primaryStagePanels.length);
    expect(primaryStagePanels).toEqual([
      expect.stringContaining("sky"),
      expect.stringContaining("amber"),
      expect.stringContaining("violet"),
      expect.stringContaining("emerald"),
    ]);
  });

  it("treats already captured as the captured success state", () => {
    expect(captureStateTone("already_captured")).toEqual(
      captureStateTone("captured"),
    );
  });
});
