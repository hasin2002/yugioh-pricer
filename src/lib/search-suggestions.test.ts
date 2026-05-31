import { describe, expect, it } from "vitest";

import { shouldSuggestMetadata } from "@/lib/search-suggestions";

describe("search suggestions", () => {
  it("waits until the user has typed a meaningful query", () => {
    expect(shouldSuggestMetadata("")).toBe(false);
    expect(shouldSuggestMetadata(" a ")).toBe(false);
    expect(shouldSuggestMetadata("dm")).toBe(true);
  });
});
