"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertTriangle,
  Camera,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AppRouter } from "@/server/api/root";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { captureFrameQuality } from "@/lib/capture-quality";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type JoinedSession = NonNullable<
  RouterOutputs["capture"]["join"]["session"]
>;
type CaptureState =
  | "joining"
  | "checking"
  | "detecting"
  | "hold_steady"
  | "uploading"
  | "captured"
  | "already_captured"
  | "needs_review"
  | "claimed"
  | "archived"
  | "error";
type CandidateFrame = {
  blob: Blob;
  cardLike: boolean;
  signature: string;
  brightness: number;
};
type CapturedItem = {
  id: number;
  quantity: number;
};
type BurstUploadResponse = {
  status?: "captured" | "already_captured";
  item?: CapturedItem;
  error?: string;
};

const SECURE_CONTEXT_ERROR =
  "Camera access requires HTTPS. Open this page through your Cloudflare Tunnel URL on the iPhone.";
const CAPTURE_BURST_FRAME_COUNT = 4;
const DETECTION_INTERVAL_MS = 300;
const BURST_FRAME_INTERVAL_MS = 180;
const STABLE_FRAME_TARGET = 2;
const SIGNATURE_MOVEMENT_THRESHOLD = 64;
const MIN_USABLE_BRIGHTNESS = 18;

export function CaptureClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastSignatureRef = useRef<string | null>(null);
  const stableFrameCountRef = useRef(0);
  const burstInFlightRef = useRef(false);
  const [captureState, setCaptureState] = useState<CaptureState>("joining");
  const [message, setMessage] = useState("Joining pricing session...");
  const [joinedSession, setJoinedSession] = useState<JoinedSession | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [capturedItem, setCapturedItem] = useState<CapturedItem | null>(null);
  const [quantityUpdating, setQuantityUpdating] = useState(false);

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

  const resetDetection = useCallback(() => {
    lastSignatureRef.current = null;
    stableFrameCountRef.current = 0;
  }, []);

  const startCamera = useCallback(async () => {
    if (!window.isSecureContext) {
      setCaptureState("error");
      setMessage(SECURE_CONTEXT_ERROR);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCaptureState("error");
      setMessage(
        "This browser does not expose camera capture. Use iPhone Safari over HTTPS.",
      );
      return;
    }

    setCaptureState("checking");
    setMessage("Checking camera access...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      resetDetection();
      setCapturedItem(null);
      setCaptureState("detecting");
      setMessage("Detecting a single card. Keep the card inside the preview.");
    } catch (error) {
      setCaptureState("error");
      setMessage(cameraErrorMessage(error));
    }
  }, [resetDetection]);

  const uploadBurst = useCallback(
    async (frames: CandidateFrame[]) => {
      if (!joinCode || !clientId) {
        setCaptureState("error");
        setMessage("Join the pricing session before uploading a capture burst.");
        return;
      }

      setCaptureState("uploading");
      setMessage("Uploading four candidate frames...");

      try {
        const formData = new FormData();
        formData.set("joinCode", joinCode);
        formData.set("clientId", clientId);
        formData.set("captureFingerprint", fingerprintForFrames(frames));

        frames.forEach((frame, index) => {
          formData.append("frames", frame.blob, `candidate-${index + 1}.jpg`);
        });

        const response = await fetch("/api/capture/burst", {
          method: "POST",
          body: formData,
        });
        const body = (await response.json()) as BurstUploadResponse;

        if (!response.ok || !body.item) {
          throw new Error(
            body.error ?? "The server rejected the capture burst. Try again.",
          );
        }

        setCapturedItem(body.item);

        if (body.status === "already_captured") {
          setCaptureState("already_captured");
          setMessage(
            "Already captured. Remove the card or adjust quantity for this item.",
          );
          return;
        }

        setCaptureState("captured");
        setMessage(
          "Captured. Remove this card before scanning the next one, or adjust quantity.",
        );
      } catch (error) {
        setCaptureState("needs_review");
        setMessage(
          error instanceof Error
            ? error.message
            : "The capture burst needs another try.",
        );
        window.setTimeout(() => {
          resetDetection();
          setCaptureState("detecting");
          setMessage("Retrying with the next four-frame burst.");
        }, 1000);
      } finally {
        burstInFlightRef.current = false;
      }
    },
    [clientId, joinCode, resetDetection],
  );

  const captureBurst = useCallback(
    async (options: { requireCardLike: boolean }) => {
      if (burstInFlightRef.current) {
        return;
      }

      burstInFlightRef.current = true;

      try {
        const frames: CandidateFrame[] = [];

        for (let index = 0; index < CAPTURE_BURST_FRAME_COUNT; index += 1) {
          const frame = await captureCandidateFrame(
            videoRef.current,
            canvasRef.current,
          );

          if (frame) {
            frames.push(frame);
          }

          if (index < CAPTURE_BURST_FRAME_COUNT - 1) {
            await wait(BURST_FRAME_INTERVAL_MS);
          }
        }

        if (frames.length !== CAPTURE_BURST_FRAME_COUNT) {
          setCaptureState("needs_review");
          setMessage("The camera missed a frame. Hold steady for the next burst.");
          window.setTimeout(() => {
            burstInFlightRef.current = false;
            resetDetection();
            setCaptureState("detecting");
            setMessage("Retrying with the next four-frame burst.");
          }, 1000);
          return;
        }

        const usableFrames = frames.filter(
          (frame) => frame.brightness >= MIN_USABLE_BRIGHTNESS,
        );

        if (usableFrames.length === 0) {
          setCaptureState("needs_review");
          setMessage(
            "No usable frames captured. Align the card inside the outline.",
          );
          window.setTimeout(() => {
            burstInFlightRef.current = false;
            resetDetection();
            setCaptureState("detecting");
            setMessage("Retrying with the next four-frame burst.");
          }, 1000);
          return;
        }

        const cardLikeFrameCount = frames.filter((frame) => frame.cardLike).length;

        if (
          options.requireCardLike &&
          cardLikeFrameCount < CAPTURE_BURST_FRAME_COUNT - 1
        ) {
          setCaptureState("needs_review");
          setMessage(
            "Card moved out of the outline. Hold steady for the next burst.",
          );
          window.setTimeout(() => {
            burstInFlightRef.current = false;
            resetDetection();
            setCaptureState("detecting");
            setMessage("Retrying with the next four-frame burst.");
          }, 1000);
          return;
        }

        await uploadBurst(frames);
      } catch (error) {
        burstInFlightRef.current = false;
        setCaptureState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "The camera stream is not ready yet. Wait for the preview and try again.",
        );
      }
    },
    [resetDetection, uploadBurst],
  );

  useEffect(() => {
    let cancelled = false;

    async function joinSession() {
      const params = new URLSearchParams(window.location.search);
      const nextJoinCode = params.get("join");

      if (!nextJoinCode) {
        setCaptureState("error");
        setMessage("Open the Capture Client from a pricing session join link.");
        return;
      }

      const nextClientId = captureClientId();
      setJoinCode(nextJoinCode);
      setClientId(nextClientId);

      const result = await trpc.capture.join.mutate({
        joinCode: nextJoinCode,
        clientId: nextClientId,
      });

      if (cancelled) {
        return;
      }

      if (result.status === "not_found") {
        setCaptureState("error");
        setMessage("This join code does not match a pricing session.");
        return;
      }

      if (result.status === "already_claimed") {
        setJoinedSession(result.session);
        setCaptureState("claimed");
        setMessage(
          "Another Capture Client is already active for this pricing session.",
        );
        return;
      }

      setJoinedSession(result.session);

      if (result.session.archivedAt) {
        setCaptureState("archived");
        setMessage("This pricing session is archived. Confirm before starting capture.");
        return;
      }

      await startCamera();
    }

    void joinSession().catch((error) => {
      if (!cancelled) {
        setCaptureState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "The pricing session could not be joined.",
        );
      }
    });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [startCamera, trpc]);

  useEffect(() => {
    if (captureState !== "detecting" && captureState !== "hold_steady") {
      return;
    }

    const interval = window.setInterval(() => {
      void detectStableFrame();
    }, DETECTION_INTERVAL_MS);

    async function detectStableFrame() {
      if (burstInFlightRef.current) {
        return;
      }

      const frame = await captureCandidateFrame(videoRef.current, canvasRef.current);

      if (!frame || frame.brightness < MIN_USABLE_BRIGHTNESS) {
        resetDetection();
        setCaptureState("detecting");
        setMessage("Detecting a usable card image. Improve light or framing.");
        return;
      }

      if (!frame.cardLike) {
        resetDetection();
        setCaptureState("detecting");
        setMessage("Align one card inside the outline before auto-capture.");
        return;
      }

      const previousSignature = lastSignatureRef.current;
      const movement = previousSignature
        ? signatureDistance(previousSignature, frame.signature)
        : Number.POSITIVE_INFINITY;
      lastSignatureRef.current = frame.signature;

      if (movement <= SIGNATURE_MOVEMENT_THRESHOLD) {
        stableFrameCountRef.current += 1;
      } else {
        stableFrameCountRef.current = 1;
      }

      if (stableFrameCountRef.current >= STABLE_FRAME_TARGET) {
        setCaptureState("hold_steady");
        setMessage("Hold steady. Capturing four candidate frames.");
        window.clearInterval(interval);
        await captureBurst({ requireCardLike: true });
        return;
      }

      setCaptureState("detecting");
      setMessage("Detecting a stable single-card capture.");
    }

    return () => window.clearInterval(interval);
  }, [captureBurst, captureState, resetDetection]);

  async function replaceActiveClient() {
    if (!joinCode || !clientId) {
      return;
    }

    setCaptureState("joining");
    setMessage("Replacing the active Capture Client...");

    const result = await trpc.capture.join.mutate({
      joinCode,
      clientId,
      replaceExisting: true,
    });

    if (result.status !== "joined") {
      setCaptureState("error");
      setMessage("The active Capture Client could not be replaced.");
      return;
    }

    setJoinedSession(result.session);

    if (result.session.archivedAt) {
      setCaptureState("archived");
      setMessage("This pricing session is archived. Confirm before starting capture.");
      return;
    }

    await startCamera();
  }

  async function adjustQuantity(delta: -1 | 1) {
    if (!capturedItem) {
      return;
    }

    setQuantityUpdating(true);

    try {
      const item = await trpc.sessions.adjustItemQuantity.mutate({
        id: capturedItem.id,
        delta,
      });

      if (item) {
        setCapturedItem({ id: item.id, quantity: item.quantity });
      }
    } finally {
      setQuantityUpdating(false);
    }
  }

  function resumeDetection() {
    resetDetection();
    setCapturedItem(null);
    setCaptureState("detecting");
    setMessage("Detecting the next card.");
  }

  return (
    <section className="min-h-screen bg-muted/40 p-4 text-foreground sm:p-6">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative overflow-hidden rounded-lg border bg-black">
          <video
            ref={videoRef}
            className="aspect-[3/4] w-full bg-black object-cover sm:aspect-video"
            muted
            playsInline
          />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 aspect-[59/86] h-[72%] max-h-[86%] max-w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]"
            aria-hidden="true"
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <Card className="rounded-lg">
          <CardHeader>
            <CardDescription className="text-xs font-bold uppercase">
              Capture Client
            </CardDescription>
            <CardTitle className="text-2xl">
              {joinedSession?.name ?? "Join pricing session"}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="mb-4 rounded-lg border bg-muted/40 p-3">
              <p className="text-sm font-bold" data-state={captureState}>
                {captureStateLabel(captureState)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{message}</p>
              {joinedSession?.archivedAt && captureState === "archived" ? (
                <Alert className="mt-3 border-amber-200 bg-amber-50 text-amber-800">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription>
                    Captures added here will join an archived session. Continue only
                    if you meant to reopen this review workflow.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>

            {capturedItem ? (
              <div className="mb-4 rounded-lg border p-3">
                <p className="text-xs font-bold uppercase text-muted-foreground">
                  Captured quantity
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    className="h-11 w-11 p-0"
                    type="button"
                    variant="outline"
                    onClick={() => void adjustQuantity(-1)}
                    disabled={quantityUpdating || capturedItem.quantity <= 1}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <div className="flex h-11 min-w-16 items-center justify-center rounded-md border bg-background px-3 text-lg font-bold">
                    {capturedItem.quantity}
                  </div>
                  <Button
                    className="h-11 w-11 p-0"
                    type="button"
                    variant="outline"
                    onClick={() => void adjustQuantity(1)}
                    disabled={quantityUpdating}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              {captureState === "archived" ? (
                <Button
                  className="h-11"
                  type="button"
                  variant="secondary"
                  onClick={() => void startCamera()}
                >
                  Start capture anyway
                </Button>
              ) : null}
              {captureState === "claimed" ? (
                <Button
                  className="h-11"
                  type="button"
                  onClick={() => void replaceActiveClient()}
                >
                  Replace active client
                </Button>
              ) : null}
              {captureState === "captured" ||
              captureState === "already_captured" ? (
                <Button className="h-11" type="button" onClick={resumeDetection}>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Card removed
                </Button>
              ) : null}
              {captureState === "detecting" ||
              captureState === "hold_steady" ||
              captureState === "needs_review" ? (
                <Button
                  className="h-11"
                  type="button"
                  variant="outline"
                  onClick={() => void captureBurst({ requireCardLike: false })}
                  disabled={burstInFlightRef.current}
                >
                  <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
                  Manual capture
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Camera permission was blocked. Allow camera access in Safari and reload this page.";
    }

    if (error.name === "NotFoundError") {
      return "No rear camera was found. Try another iPhone or browser camera source.";
    }

    if (error.name === "NotReadableError") {
      return "The camera is already in use. Close other camera apps and reload this page.";
    }
  }

  return "The camera could not be started. Use iPhone Safari over HTTPS and reload this page.";
}

function captureClientId() {
  const storageKey = "yugioh-pricer:capture-client-id";
  const existing = window.localStorage.getItem(storageKey);

  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  window.localStorage.setItem(storageKey, next);

  return next;
}

function captureStateLabel(state: CaptureState) {
  switch (state) {
    case "joining":
      return "Joining";
    case "checking":
      return "Checking";
    case "detecting":
      return "Detecting";
    case "hold_steady":
      return "Hold steady";
    case "uploading":
      return "Uploading";
    case "captured":
      return "Captured";
    case "already_captured":
      return "Already captured";
    case "needs_review":
      return "Needs review";
    case "claimed":
      return "Already active";
    case "archived":
      return "Archived session";
    case "error":
      return "Action needed";
  }
}

async function captureCandidateFrame(
  video: HTMLVideoElement | null,
  canvas: HTMLCanvasElement | null,
): Promise<CandidateFrame | null> {
  if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const metrics = captureFrameQuality({
    data: imageData.data,
    width: canvas.width,
    height: canvas.height,
  });
  const blob = await canvasBlob(canvas);

  if (!blob) {
    return null;
  }

  return {
    blob,
    cardLike: metrics.cardLike,
    signature: metrics.signature,
    brightness: metrics.brightness,
  };
}

function signatureDistance(left: string, right: string) {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);

  for (let index = 0; index < length; index += 1) {
    distance += Math.abs(parseInt(left[index]!, 16) - parseInt(right[index]!, 16));
  }

  return distance;
}

function fingerprintForFrames(frames: CandidateFrame[]) {
  return frames.map((frame) => frame.signature).join(".");
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.88);
  });
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
