"use client";

import { useEffect, useRef, useState } from "react";

type CaptureState = "checking" | "ready" | "captured" | "uploading" | "saved" | "error";

const SECURE_CONTEXT_ERROR =
  "Camera access requires HTTPS. Open this page through your Cloudflare Tunnel URL on the iPhone.";

export function CaptureClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>("checking");
  const [message, setMessage] = useState("Checking camera access...");
  const [savedPath, setSavedPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
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

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

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
    }

    void startCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
          <h1 className="mb-4 text-2xl font-bold leading-tight">Best Frame smoke test</h1>

          <div className="mb-4 rounded-md border border-[#d9dee7] bg-[#f6f7f9] p-3">
            <p className="text-sm font-bold" data-state={captureState}>
              {captureStateLabel(captureState)}
            </p>
            <p className="mt-1 text-sm text-[#667085]">{message}</p>
            {savedPath ? (
              <p className="mt-2 break-all text-xs text-[#667085]">{savedPath}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
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

function captureStateLabel(state: CaptureState) {
  switch (state) {
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
    case "error":
      return "Action needed";
  }
}
