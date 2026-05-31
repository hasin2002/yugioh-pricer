import { describe, expect, it } from "vitest";

import { appMeta, bestFrames } from "@/server/db/schema";

describe("database schema", () => {
  it("defines the initial app metadata table", () => {
    expect(appMeta[Symbol.for("drizzle:Name")]).toBe("app_meta");
  });

  it("defines the best frame storage table", () => {
    expect(bestFrames[Symbol.for("drizzle:Name")]).toBe("best_frames");
  });
});
