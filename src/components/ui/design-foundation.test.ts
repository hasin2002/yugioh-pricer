import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("shadcn design foundation", () => {
  it("keeps shadcn configured as the reusable UI foundation", () => {
    const config = JSON.parse(readFileSync("components.json", "utf8")) as {
      style: string;
      tailwind: { css: string; cssVariables: boolean };
      aliases: { ui: string };
    };

    expect(config.style).toBe("radix-nova");
    expect(config.tailwind.css).toBe("src/app/globals.css");
    expect(config.tailwind.cssVariables).toBe(true);
    expect(config.aliases.ui).toBe("@/components/ui");
  });

  it("documents the slate-neutral theme direction", () => {
    const adr = readFileSync("adr/0009-shadcn-design-foundation.md", "utf8");
    const globals = readFileSync("src/app/globals.css", "utf8");

    expect(adr).toContain("neutral/slate");
    expect(adr).toContain("dark slate primary");
    expect(adr).toContain("muted teal accent");
    expect(globals).toContain("--primary: oklch(0.279 0.041 260.031)");
    expect(globals).toContain("--ring: oklch(0.45 0.09 194)");
  });

  it("keeps primary link-buttons readable against the primary background", () => {
    const dashboard = readFileSync(
      "src/components/session-dashboard.tsx",
      "utf8",
    );

    expect(dashboard).toContain(
      "h-10 !text-primary-foreground hover:!text-primary-foreground",
    );
  });

  it("keeps standalone lookup and cache maintenance off the homepage", () => {
    const dashboard = readFileSync(
      "src/components/session-dashboard.tsx",
      "utf8",
    );

    expect(dashboard).not.toContain("Card lookup");
    expect(dashboard).not.toContain("Card metadata cache");
    expect(dashboard).toContain("Search card metadata for manual entry");
  });
});
