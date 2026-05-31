import { describe, expect, it } from "vitest";

import { searchRarities } from "@/lib/printing-options";

describe("printing options", () => {
  it("returns deduplicated rarity labels", () => {
    const labels = searchRarities("ultra", 100).map((option) => option.value);

    expect(labels).toContain("Ultra Rare");
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("matches aliases to canonical rarity values", () => {
    expect(searchRarities("QCSR")[0]).toMatchObject({
      value: "Quarter Century Secret Rare",
      alias: "QCSR",
    });
  });
});
