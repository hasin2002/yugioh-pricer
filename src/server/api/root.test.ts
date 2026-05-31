import { describe, expect, it } from "vitest";

import { appRouter } from "@/server/api/root";

describe("appRouter", () => {
  it("responds on the typed health path", async () => {
    const caller = appRouter.createCaller({});

    await expect(caller.app.health({ client: "review" })).resolves.toEqual({
      ok: true,
      client: "review",
      message: "Typed API path ready",
    });
  });
});
