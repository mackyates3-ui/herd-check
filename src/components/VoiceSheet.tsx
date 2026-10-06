import { Check, Keyboard, Mic, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { findCowByTag } from "../lib/tags";
import {
  VoiceSession,
  type HeardFinal,
  type VoiceFailure,
  type VoicePhase,
} from "../lib/voice/engine";
import { applyConfidence, matchSpoken, type TagCandidate } from "../lib/voice/match";
import type { Cow } from "../types";
import { Button, TextInput } from "./ui";

type Prompt =
  | { type: "counted"; tag: string; sightingId?: string }
  | { type: "choose"; heard: string; candidates: TagCandidate[] }
  | { type: "unknown"; heard: string; suggestion: string; near: TagCandidate[] };

function isFailure(error: unknown): error is VoiceFailure {
  return Boolean(error && typeof error === "object" && "type" in error);
}

export function VoiceSheet({
  open,
  cows,
  counted,
  total,
  onClose,
  onCount,
  onAddAndCount,
  onUndo,
}: {
  open: boolean;
  cows: Cow[];
  counted: number;
  total: number;
  onClose: () => void;
  onCount: (cow: Cow) => Promise<string | undefined>;
  onAddAndCount: (tag: string) => Promise<string | undefined>;
  onUndo: (sightingId: string) => void;
}) {
  const [phase, setPhase] = useState<VoicePhase | "blocked">("requesting-mic");
  const [blocked, setBlocked] = useState<"denied" | "unsupported" | "offline" | "failed" | null>(null);
  const [blockedDetail, setBlockedDetail] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [partial, setPartial] = useState("");
  const [source, setSource] = useState<"on-device" | "browser" | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [draft, setDraft] = useState("");
  const [holding, setHolding] = useState(false);
  const cowsRef = useRef(cows);
  const holdRef = useRef(false);
  const sessionRef = useRef<VoiceSession | null>(null);
  const lastHeard = useRef({ text: "", at: 0 });
  const takeFinalRef = useRef<(heard: HeardFinal) => void>(() => {});
  cowsRef.current = cows;

  useEffect(() => {
    if (!open) return;
    const session = new VoiceSession();
    sessionRef.current = session;
    let cancelled = false;
    setPhase("requesting-mic");
    setBlocked(null);
    setBlockedDetail("");
    setProgress(null);
    setPartial("");
    setSource(null);
    setPrompt(null);
    setDraft("");
    holdRef.current = false;
    setHolding(false);
    lastHeard.current = { text: "", at: 0 };

    void session
      .start({
        tags: cowsRef.current.map((cow) => cow.tag),
        onPhase: (next) => {
          if (!cancelled) setPhase(next);
        },
        onProgress: (ratio) => {
          if (!cancelled) setProgress(ratio);
        },
        onPartial: (text) => {
          if (!cancelled) setPartial(text);
        },
        onSource: (next) => {
          if (!cancelled) setSource(next);
        },
        onFailed: (message) => {
          if (cancelled) return;
          setPhase("blocked");
          setBlocked("failed");
          const friendly = message && !/^\d+$/.test(message.trim())
            ? message
            : "The speech model could not start. Type the tag instead.";
          setBlockedDetail(friendly);
        },
        onFinal: (heard) => {
          if (cancelled) return;
          takeFinalRef.current(heard);
        },
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const failure = isFailure(error) ? error : { type: "failed" as const, message: "Voice could not start." };
        setPhase("blocked");
        if (failure.type === "denied") setBlocked("denied");
        else if (failure.type === "unsupported") setBlocked("unsupported");
        else if (failure.type === "no-model-offline") setBlocked("offline");
        else {
          setBlocked("failed");
          setBlockedDetail(failure.type === "failed" ? failure.message : "");
        }
      });

    return () => {
      cancelled = true;
      session.stop();
      if (sessionRef.current === session) sessionRef.current = null;
    };
    // Restart only when the sheet opens. Herd updates go through updateTags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    sessionRef.current?.updateTags(cows.map((cow) => cow.tag));
  }, [cows, open]);

  const cue = (kind: "ok" | "choose" | "unknown") => {
    sessionRef.current?.beep(kind);
  };

  const release = () => {
    holdRef.current = false;
    setHolding(false);
  };

  const countCow = async (cow: Cow) => {
    cue("ok");
    const sightingId = await onCount(cow);
    setPrompt({ type: "counted", tag: cow.tag, sightingId });
    setPartial("");
  };

  const addTag = async (tag: string) => {
    const clean = tag.trim();
    if (!clean) return;
    cue("ok");
    const sightingId = await onAddAndCount(clean);
    setPrompt({ type: "counted", tag: clean.toUpperCase(), sightingId });
    setDraft("");
    setPartial("");
    release();
  };

  const takeFinal = (heard: HeardFinal) => {
    if (holdRef.current) return;
    const key = heard.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key) return;
    const now = Date.now();
    if (key === lastHeard.current.text && now - lastHeard.current.at < 1600) return;
    lastHeard.current = { text: key, at: now };
    const herdTags = cowsRef.current.map((cow) => cow.tag);
    const match = applyConfidence(matchSpoken(heard.text, herdTags), heard.confidence, heard.source);
    if (match.kind === "empty") return;
    if (match.kind === "unique") {
      const cow = cowsRef.current.find((item) => item.tag === match.tag) ?? findCowByTag(cowsRef.current, match.tag);
      if (cow) void countCow(cow);
      return;
    }
    holdRef.current = true;
    setHolding(true);
    setPartial("");
    if (match.kind === "ambiguous") {
      setPrompt({ type: "choose", heard: match.heard, candidates: match.candidates });
      setDraft("");
      cue("choose");
      return;
    }
    setDraft(match.suggestion);
    setPrompt({
      type: "unknown",
      heard: match.heard,
      suggestion: match.suggestion,
      near: match.near,
    });
    cue("unknown");
  };
  takeFinalRef.current = takeFinal;

  const submitTyped = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const herdTags = cowsRef.current.map((cow) => cow.tag);
    const match = matchSpoken(text, herdTags);
    if (match.kind === "unique") {
      const cow = cowsRef.current.find((item) => item.tag === match.tag) ?? findCowByTag(cowsRef.current, match.tag);
      if (cow) {
        release();
        void countCow(cow);
        return;
      }
    }
    if (match.kind === "ambiguous") {
      holdRef.current = true;
      setHolding(true);
      setPrompt({ type: "choose", heard: text, candidates: match.candidates });
      cue("choose");
      return;
    }
    if (match.kind === "unknown") {
      void addTag(match.suggestion);
      return;
    }
    const existing = findCowByTag(cowsRef.current, text);
    if (existing) {
      release();
      void countCow(existing);
      return;
    }
    void addTag(text);
  };

  const pick = (tag: string) => {
    const cow = cowsRef.current.find((item) => item.tag === tag) ?? findCowByTag(cowsRef.current, tag);
    release();
    if (cow) void countCow(cow);
  };

  if (!open) return null;

  const listening = phase === "listening" && !blocked;
  const showType =
    Boolean(blocked) ||
    (listening && prompt?.type !== "choose" && prompt?.type !== "unknown");

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 px-2">
          <h2 className="font-display text-xl">Voice tally</h2>
          <p className="text-sm text-muted-foreground">
            {counted}/{total} today
            {source === "on-device" ? " · on this phone" : source === "browser" ? " · browser speech" : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close voice tally"
          className="inline-flex size-11 items-center justify-center rounded-xl"
          onClick={onClose}
        >
          <X className="size-6" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {blocked ? (
          <BlockedNote
            kind={blocked}
            detail={blockedDetail}
          />
        ) : (
          <div className="flex flex-col items-center pt-2">
            <div className="relative grid size-28 place-items-center">
              {listening && !holding ? (
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/25" />
              ) : null}
              <span
                className={`relative grid size-24 place-items-center rounded-full text-primary-foreground ${
                  listening ? "bg-primary" : "bg-leather"
                }`}
              >
                <Mic className="size-10" />
              </span>
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground" aria-live="polite">
              {phase === "requesting-mic"
                ? "Allow the microphone, then say a tag."
                : phase === "loading-model"
                  ? "Loading offline speech. First time takes a moment."
                  : holding
                    ? "Listening paused — pick a tag or keep going."
                    : "Listening. Say the next tag when you’re ready."}
            </p>
            {phase === "loading-model" && progress != null ? (
              <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            ) : null}
            {partial ? (
              <p className="font-tag mt-4 text-center text-2xl">{partial}</p>
            ) : null}
          </div>
        )}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto" aria-live="assertive">
          {prompt?.type === "counted" ? (
            <div className="rounded-3xl bg-primary px-5 py-6 text-center text-primary-foreground">
              <Check className="mx-auto size-8" />
              <p className="mt-2 text-sm uppercase tracking-wide opacity-80">Counted</p>
              <p className="font-tag mt-1 text-4xl">{prompt.tag}</p>
              {prompt.sightingId ? (
                <Button
                  variant="secondary"
                  size="lg"
                  className="mt-4 w-full"
                  onClick={() => {
                    const id = prompt.sightingId;
                    if (!id) return;
                    onUndo(id);
                    setPrompt(null);
                  }}
                >
                  <Undo2 className="size-4" />
                  Undo
                </Button>
              ) : null}
            </div>
          ) : null}

          {prompt?.type === "choose" ? (
            <div className="rounded-3xl bg-card px-4 py-4 shadow-[var(--shadow-border)]">
              <p className="text-sm text-muted-foreground">Which tag?</p>
              <p className="font-tag mt-1 text-lg">{prompt.heard}</p>
              <div className="mt-3 flex flex-col gap-2">
                {prompt.candidates.map((candidate) => (
                  <Button
                    key={candidate.tag}
                    size="lg"
                    className="w-full"
                    onClick={() => pick(candidate.tag)}
                  >
                    <span className="font-tag text-lg">{candidate.tag}</span>
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    setPrompt(null);
                    release();
                  }}
                >
                  Neither — keep listening
                </Button>
              </div>
            </div>
          ) : null}

          {prompt?.type === "unknown" ? (
            <div className="rounded-3xl bg-card px-4 py-4 shadow-[var(--shadow-border)]">
              <p className="text-sm text-muted-foreground">No herd tag for that.</p>
              <p className="mt-1 text-sm">Heard “{prompt.heard}”.</p>
              <TextInput
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label="Tag to add"
                autoCapitalize="characters"
                autoCorrect="off"
                className="font-tag mt-3"
              />
              <Button size="lg" className="mt-3 w-full" onClick={() => void addTag(draft || prompt.suggestion)}>
                Add {draft || prompt.suggestion} and count
              </Button>
              {prompt.near.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  {prompt.near.map((candidate) => (
                    <Button
                      key={candidate.tag}
                      variant="outline"
                      size="lg"
                      className="w-full"
                      onClick={() => pick(candidate.tag)}
                    >
                      Count <span className="font-tag">{candidate.tag}</span> instead
                    </Button>
                  ))}
                </div>
              ) : null}
              <Button
                variant="ghost"
                className="mt-2 w-full"
                onClick={() => {
                  setPrompt(null);
                  release();
                }}
              >
                Keep listening
              </Button>
            </div>
          ) : null}
        </div>

        {showType ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitTyped(draft);
            }}
          >
            <TextInput
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={blocked ? "Type an eartag" : "Or type a tag"}
              aria-label="Type an eartag"
              autoCapitalize="characters"
              autoCorrect="off"
              className="font-tag"
            />
            <Button type="submit" size="lg" variant="leather" disabled={!draft.trim()}>
              <Keyboard className="size-4" />
              Count
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function BlockedNote({
  kind,
  detail,
}: {
  kind: "denied" | "unsupported" | "offline" | "failed";
  detail: string;
}) {
  const copy =
    kind === "denied"
      ? "Microphone is blocked. Type the eartag instead — you can allow the mic later in the browser settings."
      : kind === "unsupported"
        ? "This browser has no microphone. Type the eartag instead."
        : kind === "offline"
          ? "Offline voice isn’t on this phone yet. Open Herd Check once with a signal so it can save the speech model, or type the tag."
          : detail || "Voice didn’t start. Type the eartag instead.";
  return (
    <div className="rounded-3xl bg-card px-5 py-6 text-center shadow-[var(--shadow-border)]">
      <Keyboard className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{copy}</p>
    </div>
  );
}
