import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { bestFrames } from "@/server/db/schema";

export const runtime = "nodejs";

type BestFrameRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: BestFrameRouteContext) {
  const { id } = await params;
  const bestFrameId = Number(id);

  if (!Number.isInteger(bestFrameId) || bestFrameId <= 0) {
    return Response.json({ error: "Best Frame id is invalid." }, { status: 400 });
  }

  const [bestFrame] = await db
    .select()
    .from(bestFrames)
    .where(eq(bestFrames.id, bestFrameId));

  if (!bestFrame) {
    return Response.json({ error: "Best Frame not found." }, { status: 404 });
  }

  try {
    const bytes = await readFile(bestFrame.storagePath);
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": bestFrame.mimeType,
      },
    });
  } catch {
    return Response.json(
      { error: "Best Frame file is missing from disk." },
      { status: 404 },
    );
  }
}
