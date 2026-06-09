import { describe, expect, it } from "vitest";
import WebSocket from "ws";

import {
  createSessionEventsServer,
  publishSessionEvent,
  sessionEventBus,
  type SessionEvent,
} from "@/server/session-events";

function waitForMessage(socket: WebSocket) {
  return new Promise<SessionEvent>((resolve) => {
    socket.once("message", (data) => {
      resolve(JSON.parse(String(data)) as SessionEvent);
    });
  });
}

function waitForNoMessage(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 50);

    socket.once("message", (data) => {
      clearTimeout(timeout);
      reject(new Error(`Unexpected message: ${String(data)}`));
    });
  });
}

describe("session events", () => {
  it("publishes typed session events to subscribers", () => {
    const events: SessionEvent[] = [];
    const unsubscribe = sessionEventBus.subscribe((event) => events.push(event));

    try {
      publishSessionEvent({ sessionId: 14, type: "price_changed" });
    } finally {
      unsubscribe();
    }

    expect(events).toEqual([
      expect.objectContaining({
        sessionId: 14,
        type: "price_changed",
        occurredAt: expect.any(String),
      }),
    ]);
  });

  it("sends events only to WebSocket clients subscribed to the session", async () => {
    const server = await createSessionEventsServer({
      host: "127.0.0.1",
      port: 0,
    });
    const matchingSocket = new WebSocket(
      `ws://${server.host}:${server.port}/session-events?sessionId=14`,
    );
    const otherSocket = new WebSocket(
      `ws://${server.host}:${server.port}/session-events?sessionId=15`,
    );

    try {
      await Promise.all([
        waitForMessage(matchingSocket),
        waitForMessage(otherSocket),
      ]);

      publishSessionEvent({ sessionId: 14, type: "item_created" });

      await expect(waitForMessage(matchingSocket)).resolves.toMatchObject({
        sessionId: 14,
        type: "item_created",
      });
      await expect(waitForNoMessage(otherSocket)).resolves.toBeUndefined();
    } finally {
      matchingSocket.close();
      otherSocket.close();
      await server.close();
    }
  });
});
