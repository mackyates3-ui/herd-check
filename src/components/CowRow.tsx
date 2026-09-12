import { Check, LoaderCircle } from "lucide-react";
import { formatTime } from "../lib/dates";
import type { Cow, Sighting } from "../types";

export function CowRow({
  cow,
  counted,
  last,
  locating,
  onToggle,
  onOpen,
}: {
  cow: Cow;
  counted: boolean;
  last?: Sighting;
  locating: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={`flex items-stretch gap-1 rounded-2xl bg-card p-1.5 shadow-[var(--shadow-border)] ${
        counted ? "bg-primary/6 shadow-none" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={counted}
        aria-label={
          counted ? `Undo today's count for ${cow.tag}` : `Count ${cow.tag}`
        }
        disabled={locating}
        className="flex size-12 shrink-0 items-center justify-center rounded-xl"
      >
        <span
          className={`flex size-7 items-center justify-center rounded-md border-2 ${
            counted
              ? "border-primary bg-primary text-primary-foreground"
              : "border-leather/35 bg-card text-transparent"
          }`}
        >
          {locating ? (
            <LoaderCircle className="size-3.5 animate-spin text-primary" />
          ) : (
            <Check className="size-3.5" strokeWidth={3} />
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open history for ${cow.tag}`}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left"
      >
        <span className="min-w-0">
          <span className="font-tag block text-lg leading-none">{cow.tag}</span>
          <span className="mt-1 block truncate text-sm text-muted-foreground">
            {cow.name || "No name yet"}
          </span>
        </span>
        <span className="shrink-0 text-right text-xs text-muted-foreground">
          {counted ? (
            locating ? (
              "Pinning…"
            ) : last ? (
              formatTime(last.at)
            ) : (
              "Counted"
            )
          ) : last ? (
            formatTime(last.at)
          ) : (
            "Not counted"
          )}
        </span>
      </button>
    </div>
  );
}
