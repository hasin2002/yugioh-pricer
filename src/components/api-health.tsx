"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { useEffect, useMemo, useState } from "react";

import type { AppRouter } from "@/server/api/root";

type HealthState = "checking" | "ready" | "unavailable";

export function ApiHealth() {
  const [healthState, setHealthState] = useState<HealthState>("checking");
  const [message, setMessage] = useState("Checking typed API path...");

  const trpc = useMemo(
    () =>
      createTRPCClient<AppRouter>({
        links: [
          httpBatchLink({
            url: "/api/trpc",
          }),
        ],
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    trpc.app.health
      .query({ client: "review" })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setHealthState(result.ok ? "ready" : "unavailable");
        setMessage(result.message);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setHealthState("unavailable");
        setMessage("Typed API path unavailable");
      });

    return () => {
      cancelled = true;
    };
  }, [trpc]);

  return (
    <div
      className="mt-4 flex items-center gap-2.5"
      data-state={healthState}
    >
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-green-600"
        aria-hidden="true"
      />
      <span>{message}</span>
    </div>
  );
}
