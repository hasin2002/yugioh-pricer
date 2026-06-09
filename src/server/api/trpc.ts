import { initTRPC } from "@trpc/server";

import { refreshCardMetadataOnServerStart } from "@/server/cards/metadata-cache";
import { db } from "@/server/db";

if (
  process.env.NODE_ENV !== "test" &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  refreshCardMetadataOnServerStart(db);
}

export function createTRPCContext(request?: Request) {
  return {
    db,
    requestOrigin: request ? publicHttpsOriginForRequest(request) : null,
  };
}

type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

function publicHttpsOriginForRequest(request: Request) {
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const forwardedHost =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    request.headers.get("host");

  if (forwardedProto === "https" && forwardedHost) {
    return `https://${forwardedHost}`;
  }

  try {
    const url = new URL(request.url);

    if (url.protocol === "https:") {
      return url.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}
