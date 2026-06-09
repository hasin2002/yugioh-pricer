import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  CaptureBurstError,
  candidateFramesFromFormData,
  saveCaptureBurst,
} from "@/server/capture/burst";
import { db } from "@/server/db";
import { bestFrames, pricingSessions, sessionItems } from "@/server/db/schema";
import { publishSessionEvent } from "@/server/session-events";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const joinCode = stringValue(formData.get("joinCode"));
    const clientId = stringValue(formData.get("clientId"));
    const captureFingerprint = stringValue(formData.get("captureFingerprint"));

    if (!joinCode || !clientId) {
      return NextResponse.json(
        { error: "Join the pricing session before uploading a capture burst." },
        { status: 400 },
      );
    }

    if (!captureFingerprint) {
      return NextResponse.json(
        { error: "Capture burst fingerprint is required." },
        { status: 400 },
      );
    }

    const [session] = await db
      .select()
      .from(pricingSessions)
      .where(eq(pricingSessions.joinCode, joinCode));

    if (!session) {
      return NextResponse.json(
        { error: "This join code does not match a pricing session." },
        { status: 404 },
      );
    }

    if (session.activeCaptureClientId !== clientId) {
      return NextResponse.json(
        { error: "This Capture Client is not active for the pricing session." },
        { status: 409 },
      );
    }

    const [existingItem] = await db
      .select()
      .from(sessionItems)
      .where(
        and(
          eq(sessionItems.sessionId, session.id),
          eq(sessionItems.captureFingerprint, captureFingerprint),
        ),
      );

    if (existingItem) {
      return NextResponse.json({
        status: "already_captured",
        item: captureItemResponse(existingItem),
      });
    }

    const savedBurst = await saveCaptureBurst(candidateFramesFromFormData(formData));
    const insertedBestFrame = db
      .insert(bestFrames)
      .values(savedBurst.bestFrame)
      .returning()
      .get();
    const now = new Date();
    const item = db
      .insert(sessionItems)
      .values({
        sessionId: session.id,
        bestFrameId: insertedBestFrame.id,
        captureFingerprint,
        entrySource: "capture",
        cardName: "Captured card",
        setCode: "Unknown",
        passcode: "Unknown",
        rarity: "Unknown",
        rarityConfirmedAt: null,
        printingIdentityTrusted: false,
        edition: "1st Edition",
        language: "English",
        condition: "Mint",
        quantity: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    db.update(pricingSessions)
      .set({
        reviewCount: session.reviewCount + 1,
        updatedAt: now,
      })
      .where(eq(pricingSessions.id, session.id))
      .run();

    publishSessionEvent({ sessionId: session.id, type: "item_created" });
    publishSessionEvent({ sessionId: session.id, type: "review_changed" });

    return NextResponse.json(
      {
        status: "captured",
        item: captureItemResponse(item),
        bestFrame: {
          id: insertedBestFrame.id,
          storagePath: savedBurst.bestFrame.storagePath,
          mimeType: savedBurst.bestFrame.mimeType,
          sizeBytes: savedBurst.bestFrame.sizeBytes,
        },
        candidateFrameCount: savedBurst.candidateFrameCount,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CaptureBurstError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { error: "The capture burst could not be uploaded. Try again." },
      { status: 500 },
    );
  }
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function captureItemResponse(item: typeof sessionItems.$inferSelect) {
  return {
    id: item.id,
    quantity: item.quantity,
    reviewStatus: "requires_review" as const,
  };
}
