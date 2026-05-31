"use client";

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AppRouter } from "@/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type JoinedSession = NonNullable<
  RouterOutputs["capture"]["join"]["session"]
>;
type CaptureState =
  | "joining"
  | "checking"
  | "ready"
  | "captured"
  | "uploading"
  | "saved"
  | "claimed"
  | "archived"
  | "error";

const SECURE_CONTEXT_ERROR =
  "Camera access requires HTTPS. Open this page through your Cloudflare Tunnel URL on the iPhone.";

export function CaptureClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>("joining");
  const [message, setMessage] = useState("Joining pricing session...");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [joinedSession, setJoinedSession] = useState<JoinedSession | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

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

  const startCamera = useCallback(async () => {
    if (!window.isSecureContext) {
      setCaptureState("error");
      setMessage(SECURE_CONTEXT_ERROR);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCaptureState("error");
      setMessage("This browser does not expose camera capture. Use iPhone Safari over HTTPS.");
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

      setCaptureState("ready");
      setMessage("Camera ready. Frame the card and capture a still.");
    } catch (error) {
      setCaptureState("error");
      setMessage(cameraErrorMessage(error));
    }
  }, []);

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
        setMessage("Another Capture Client is already active for this pricing session.");
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
        setMessage(error instanceof Error ? error.message : "The pricing session could not be joined.");
      }
    });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [startCamera, trpc]);

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

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      setCaptureState("error");
      setMessage("The camera stream is not ready yet. Wait for the preview and try again.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCaptureState("error");
          setMessage("The still frame could not be captured. Retake the photo.");
          return;
        }

        capturedBlobRef.current = blob;
        setCaptureState("captured");
        setMessage("Still frame captured. Upload it as the Best Frame.");
      },
      "image/jpeg",
      0.92,
    );
  }

  async function uploadFrame() {
    const blob = capturedBlobRef.current;

    if (!blob) {
      setCaptureState("error");
      setMessage("Capture a still frame before uploading.");
      return;
    }

    setCaptureState("uploading");
    setMessage("Uploading Best Frame...");

    try {
      const formData = new FormData();
      formData.set("frame", blob, "best-frame.jpg");

      const response = await fetch("/api/capture/best-frame", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as {
        bestFrame?: { storagePath: string };
        error?: string;
      };

      if (!response.ok || !body.bestFrame) {
        throw new Error(body.error ?? "The server rejected the upload. Retake the photo.");
      }

      setSavedPath(body.bestFrame.storagePath);
      setCaptureState("saved");
      setMessage("Best Frame saved.");
    } catch (error) {
      setCaptureState("error");
      setMessage(error instanceof Error ? error.message : "The frame could not be uploaded. Try again.");
    }
  }

  return (
    <section className="min-h-screen bg-[#f6f7f9] p-4 text-[#151923] sm:p-6">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-lg border border-[#d9dee7] bg-black">
          <video
            ref={videoRef}
            className="aspect-[3/4] w-full bg-black object-cover sm:aspect-video"
            muted
            playsInline
          />
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <aside className="rounded-lg border border-[#d9dee7] bg-white p-4">
          <p className="mb-1 text-xs font-bold uppercase text-[#667085]">Capture Client</p>
          <h1 className="mb-4 text-2xl font-bold leading-tight">
            {joinedSession?.name ?? "Join pricing session"}
          </h1>

          <div className="mb-4 rounded-md border border-[#d9dee7] bg-[#f6f7f9] p-3">
            <p className="text-sm font-bold" data-state={captureState}>
              {captureStateLabel(captureState)}
            </p>
            <p className="mt-1 text-sm text-[#667085]">{message}</p>
            {joinedSession?.archivedAt && captureState === "archived" ? (
              <div className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  Captures added here will join an archived session. Continue only
                  if you meant to reopen this review workflow.
                </p>
              </div>
            ) : null}
            {savedPath ? (
              <p className="mt-2 break-all text-xs text-[#667085]">{savedPath}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            {captureState === "archived" ? (
              <button
                className="min-h-11 rounded-md bg-amber-700 px-4 font-bold text-white hover:bg-amber-800"
                type="button"
                onClick={() => void startCamera()}
              >
                Start capture anyway
              </button>
            ) : null}
            {captureState === "claimed" ? (
              <button
                className="min-h-11 rounded-md bg-teal-700 px-4 font-bold text-white hover:bg-teal-800"
                type="button"
                onClick={() => void replaceActiveClient()}
              >
                Replace active client
              </button>
            ) : null}
            <button
              className="min-h-11 rounded-md bg-teal-700 px-4 font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
              type="button"
              onClick={captureFrame}
              disabled={captureState !== "ready" && captureState !== "captured" && captureState !== "saved"}
            >
              Capture still
            </button>
            <button
              className="min-h-11 rounded-md border border-[#b8c0cc] bg-white px-4 font-bold text-[#151923] hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
              type="button"
              onClick={() => void uploadFrame()}
              disabled={captureState !== "captured"}
            >
              Upload Best Frame
            </button>
          </div>
        </aside>
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
    case "ready":
      return "Ready";
    case "captured":
      return "Captured";
    case "uploading":
      return "Uploading";
    case "saved":
      return "Saved";
    case "claimed":
      return "Already active";
    case "archived":
      return "Archived session";
    case "error":
      return "Action needed";
  }
}
