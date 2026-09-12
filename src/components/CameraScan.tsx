import { Camera, Keyboard, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findCowByTag, normalizeTag } from "../lib/tags";
import { preprocessTagFrame, recognizeTag } from "../lib/ocr";
import type { Cow } from "../types";
import { Button, TextInput } from "./ui";

type ScanPhase = "live" | "reading" | "review" | "denied" | "unsupported";

export function CameraScan({
  open,
  cows,
  onClose,
  onCount,
  onAddAndCount,
}: {
  open: boolean;
  cows: Cow[];
  onClose: () => void;
  onCount: (cow: Cow) => void;
  onAddAndCount: (tag: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const workRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<ScanPhase>("live");
  const [tag, setTag] = useState("");
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      stopStream();
      setPhase("live");
      setTag("");
      setRaw("");
      setError("");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setPhase("live");
      } catch {
        setPhase("denied");
        setError("Camera permission was denied. Type the eartag instead.");
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const readFrame = async () => {
    const video = videoRef.current;
    const work = workRef.current;
    if (!video || !work || video.readyState < 2) {
      setError("Hold the tag in the box, then try again.");
      return;
    }
    setPhase("reading");
    setError("");
    try {
      preprocessTagFrame(video, work);
      const result = await recognizeTag(work);
      const next = result.candidate || normalizeTag(result.text);
      setRaw(result.text);
      setTag(next);
      setPhase("review");
    } catch {
      setError("Could not read that frame. You can type the tag.");
      setPhase("review");
    }
  };

  const match = findCowByTag(cows, tag);
  const ready = normalizeTag(tag).length > 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-leather text-primary-foreground">
      <header className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="font-display px-2 text-xl">Scan eartag</h2>
        <button
          type="button"
          aria-label="Close camera"
          className="inline-flex size-11 items-center justify-center rounded-xl"
          onClick={onClose}
        >
          <X className="size-6" />
        </button>
      </header>

      {phase === "denied" || phase === "unsupported" ? (
        <div className="mx-4 mt-6 rounded-3xl bg-black/25 px-5 py-8 text-center">
          <Keyboard className="mx-auto size-8 opacity-80" />
          <p className="mt-3 text-sm text-primary-foreground/80">
            {phase === "unsupported"
              ? "This device has no camera. Type the eartag below."
              : error || "Camera permission was denied. Type the eartag instead."}
          </p>
        </div>
      ) : (
        <div className="relative mx-3 mt-2 min-h-0 flex-1 overflow-hidden rounded-3xl bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[28%] w-[62%] rounded-2xl border-2 border-primary-foreground/90 shadow-[0_0_0_999px_rgba(28,24,20,0.35)]" />
          </div>
          {phase === "reading" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-leather/50 text-lg">
              Reading tag…
            </div>
          ) : null}
          <canvas ref={workRef} className="hidden" />
        </div>
      )}

      <div className="px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {phase === "live" ? (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm text-primary-foreground/75">
              Fill the box with the tag. High-contrast plastic numbers work best.
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={() => void readFrame()}
              aria-label="Capture and read eartag"
            >
              <Camera className="size-5" />
              Read tag
            </Button>
            <Button
              variant="ghost"
              className="text-primary-foreground"
              onClick={() => setPhase("review")}
            >
              Type instead
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {raw ? (
              <p className="text-xs text-primary-foreground/65">Raw read: {raw || "—"}</p>
            ) : null}
            {error && phase !== "denied" && phase !== "unsupported" ? (
              <p className="text-sm text-primary-foreground/80">{error}</p>
            ) : null}
            <label className="block">
              <span className="mb-1.5 block text-sm">Eartag</span>
              <TextInput
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
                className="font-tag text-xl tracking-wide text-foreground"
                placeholder="014"
              />
            </label>
            {match ? (
              <p className="text-sm">
                Matches {match.tag}
                {match.name ? ` · ${match.name}` : ""}. Count it for today?
              </p>
            ) : ready ? (
              <p className="text-sm">Unknown tag. Add it to the herd, then count.</p>
            ) : (
              <p className="text-sm text-primary-foreground/70">
                Correct the digits if the read was off.
              </p>
            )}
            <div className="flex flex-col gap-2">
              {match ? (
                <Button
                  size="lg"
                  disabled={!ready}
                  onClick={() => {
                    onCount(match);
                    onClose();
                  }}
                >
                  Count today
                </Button>
              ) : (
                <Button
                  size="lg"
                  disabled={!ready}
                  onClick={() => {
                    onAddAndCount(normalizeTag(tag));
                    onClose();
                  }}
                >
                  Add to herd and count
                </Button>
              )}
              {phase !== "denied" && phase !== "unsupported" ? (
                <Button
                  variant="outline"
                  className="border-primary-foreground/30 bg-transparent text-primary-foreground"
                  onClick={() => {
                    setPhase("live");
                    setError("");
                  }}
                >
                  Retake
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
