import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { appRouter } from "@/server/api/root";
import * as schema from "@/server/db/schema";

function createTestCaller() {
  const sqlite = new Database(":memory:");

  sqlite.exec(`
    CREATE TABLE pricing_sessions (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text NOT NULL,
      archived_at integer,
      review_count integer DEFAULT 0 NOT NULL,
      created_at integer DEFAULT (unixepoch()) NOT NULL,
      updated_at integer DEFAULT (unixepoch()) NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });

  return {
    caller: appRouter.createCaller({ db }),
    db,
    close: () => sqlite.close(),
  };
}

describe("appRouter", () => {
  it("responds on the typed health path", async () => {
    const { caller, close } = createTestCaller();

    try {
      await expect(caller.app.health({ client: "review" })).resolves.toEqual({
        ok: true,
        client: "review",
        message: "Typed API path ready",
      });
    } finally {
      close();
    }
  });

  it("creates and renames durable pricing sessions", async () => {
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();

      expect(session.name).toMatch(/^Pricing Session /);
      expect(session.reviewCount).toBe(0);

      const renamed = await caller.sessions.rename({
        id: session.id,
        name: "Binder Review",
      });
      const sessions = await caller.sessions.list();

      expect(renamed?.name).toBe("Binder Review");
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.name).toBe("Binder Review");
    } finally {
      close();
    }
  });

  it("excludes archived sessions from default lists and summary counts", async () => {
    const { caller, db, close } = createTestCaller();

    try {
      const [activeSession] = await db
        .insert(schema.pricingSessions)
        .values({ name: "Active Review", reviewCount: 3 })
        .returning();
      const [archivedSession] = await db
        .insert(schema.pricingSessions)
        .values({
          name: "Archived Review",
          reviewCount: 8,
          archivedAt: new Date(),
        })
        .returning();

      const defaultSessions = await caller.sessions.list();
      const allSessions = await caller.sessions.list({ includeArchived: true });
      const summary = await caller.sessions.summary();

      expect(defaultSessions.map((session) => session.id)).toEqual([
        activeSession.id,
      ]);
      expect(allSessions.map((session) => session.id).sort()).toEqual(
        [activeSession.id, archivedSession.id].sort(),
      );
      expect(summary.activeSessionCount).toBe(1);
      expect(summary.archivedSessionCount).toBe(1);
      expect(summary.activeReviewCount).toBe(3);
      expect(summary.collectionEstimatedValue).toBe("£0.00");
      expect(summary.continueSession?.id).toBe(activeSession.id);
    } finally {
      close();
    }
  });

  it("unarchives and deletes pricing sessions", async () => {
    const { caller, close } = createTestCaller();

    try {
      const session = await caller.sessions.create();
      const archived = await caller.sessions.archive({ id: session.id });

      expect(archived?.archivedAt).not.toBeNull();
      await expect(caller.sessions.list()).resolves.toEqual([]);

      const unarchived = await caller.sessions.unarchive({ id: session.id });

      expect(unarchived?.archivedAt).toBeNull();
      await expect(caller.sessions.list()).resolves.toHaveLength(1);

      await expect(caller.sessions.delete({ id: session.id })).resolves.toEqual({
        deleted: true,
      });
      await expect(caller.sessions.list({ includeArchived: true })).resolves.toEqual(
        [],
      );
    } finally {
      close();
    }
  });
});
