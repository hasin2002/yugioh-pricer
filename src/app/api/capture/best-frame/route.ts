import { NextResponse } from "next/server";

import { saveBestFrameFile, BestFrameUploadError } from "@/server/capture/best-frame";
import { db } from "@/server/db";
import { bestFrames } from "@/server/db/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const frame = formData.get("frame");

    if (!(frame instanceof File)) {
      return NextResponse.json(
        { error: "Capture a still frame before uploading." },
        { status: 400 },
      );
    }

    const savedFrame = await saveBestFrameFile(frame);
    const result = db.insert(bestFrames).values(savedFrame).run();

    return NextResponse.json(
      {
        bestFrame: {
          id: Number(result.lastInsertRowid),
          storagePath: savedFrame.storagePath,
          mimeType: savedFrame.mimeType,
          sizeBytes: savedFrame.sizeBytes,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BestFrameUploadError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { error: "The frame could not be uploaded. Try again." },
      { status: 500 },
    );
  }
}
