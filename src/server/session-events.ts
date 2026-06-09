import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

export type SessionEventType =
  | "item_created"
  | "item_updated"
  | "price_changed"
  | "review_changed"
  | "quantity_changed"
  | "session_status_changed";

export type SessionEvent = {
  sessionId: number;
  type: SessionEventType;
  occurredAt: string;
};

type SessionEventListener = (event: SessionEvent) => void;

type SessionEventsServer = {
  host: string;
  port: number;
  close: () => Promise<void>;
};

const AUTO_ASSIGNED_SESSION_EVENTS_PORT = 0;

class SessionEventBus {
  private readonly listeners = new Set<SessionEventListener>();

  subscribe(listener: SessionEventListener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: SessionEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const sessionEventBus = new SessionEventBus();

let serverRuntime: SessionEventsServer | null = null;
let serverStartup: Promise<SessionEventsServer> | null = null;

export function publishSessionEvent(input: {
  sessionId: number;
  type: SessionEventType;
}) {
  sessionEventBus.publish({
    ...input,
    occurredAt: new Date().toISOString(),
  });
}

export function createSessionEventsServer(options: {
  host?: string;
  port?: number;
} = {}) {
  const host = options.host ?? "0.0.0.0";
  const requestedPort = options.port ?? AUTO_ASSIGNED_SESSION_EVENTS_PORT;
  const server: Server = createServer();
  const wsServer = new WebSocketServer({ noServer: true });
  const sockets = new Set<WebSocket>();
  const unsubscribe = sessionEventBus.subscribe((event) => {
    const payload = JSON.stringify(event);

    for (const socket of sockets) {
      if (
        socket.readyState === socket.OPEN &&
        socketSessionId(socket) === event.sessionId
      ) {
        socket.send(payload);
      }
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

    if (url.pathname !== "/session-events") {
      socket.destroy();
      return;
    }

    const sessionId = Number(url.searchParams.get("sessionId"));

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketSessionIds.set(websocket, sessionId);
      sockets.add(websocket);
      websocket.on("close", () => {
        sockets.delete(websocket);
        websocketSessionIds.delete(websocket);
      });
      websocket.send(
        JSON.stringify({
          sessionId,
          type: "session_status_changed",
          occurredAt: new Date().toISOString(),
        } satisfies SessionEvent),
      );
    });
  });

  const ready = new Promise<SessionEventsServer>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => {
      server.off("error", reject);
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : requestedPort;

      resolve({
        host,
        port,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            unsubscribe();
            for (const socket of sockets) {
              socket.close();
            }
            wsServer.close();
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }

              closeResolve();
            });
          }),
      });
    });
  });

  return ready;
}

export async function ensureSessionEventsServer() {
  if (serverRuntime) {
    return serverRuntime;
  }

  if (!serverStartup) {
    serverStartup = createSessionEventsServer({
      port:
        Number(process.env.SESSION_EVENTS_WS_PORT) ||
        AUTO_ASSIGNED_SESSION_EVENTS_PORT,
    }).then((server) => {
      serverRuntime = server;
      return server;
    });
  }

  return serverStartup;
}

export async function sessionEventsUrlForRequest(request: Request) {
  const server = await ensureSessionEventsServer();
  const requestUrl = new URL(request.url);
  const protocol = requestUrl.protocol === "https:" ? "wss:" : "ws:";
  const hostname =
    requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1"
      ? "127.0.0.1"
      : requestUrl.hostname;

  return `${protocol}//${hostname}:${server.port}/session-events`;
}

const websocketSessionIds = new WeakMap<WebSocket, number>();

function socketSessionId(socket: WebSocket) {
  return websocketSessionIds.get(socket);
}
