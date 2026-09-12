import { MapPin, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { formatSightingStamp, groupSightingsByDay } from "../lib/dates";
import { formatAccuracy, formatCoords, mapsUrl } from "../lib/geo";
import { cowCountedToday } from "../lib/tags";
import type { Cow, CowDraft, Sighting } from "../types";
import { CowForm } from "./CowForm";
import { SightingMap } from "./SightingMap";
import { Button, IconButton, Sheet } from "./ui";

export function CowSheet({
  cow,
  sightings,
  open,
  onClose,
  onCount,
  onUndo,
  onRemoveSighting,
  onLocate,
  onSave,
  onRemoveCow,
}: {
  cow: Cow | null;
  sightings: Sighting[];
  open: boolean;
  onClose: () => void;
  onCount: (cow: Cow) => void;
  onUndo: (cow: Cow) => void;
  onRemoveSighting: (id: string) => void;
  onLocate: (id: string) => Promise<void>;
  onSave: (id: string, draft: CowDraft) => void;
  onRemoveCow: (cow: Cow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const counted = cow ? cowCountedToday(sightings, cow.id) : false;
  const history = cow
    ? sightings.filter((s) => s.cowId === cow.id).sort((a, b) => b.at - a.at)
    : [];
  const groups = groupSightingsByDay(history);

  return (
    <Sheet open={open && Boolean(cow)} title={cow?.tag ?? "Cow"} onClose={onClose}>
      {cow ? (
        <>
          <header className="flex items-start justify-between gap-3 px-5 pt-5">
            <div>
              <p className="font-tag text-3xl leading-none">{cow.tag}</p>
              <p className="mt-1 text-muted-foreground">
                {cow.name || "No name yet"}
                {counted ? "" : " · Not counted today"}
              </p>
            </div>
            <IconButton label="Close cow history" onClick={onClose}>
              <X className="size-5" />
            </IconButton>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {cow.notes ? (
              <p className="mb-4 text-sm text-muted-foreground">{cow.notes}</p>
            ) : null}

            <div className="mb-5 flex gap-2">
              <Button size="lg" className="flex-1" onClick={() => onCount(cow)}>
                {counted ? "Log another" : "Count today"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => onUndo(cow)}
                disabled={!counted}
              >
                Undo today
              </Button>
            </div>

            <SightingMap sightings={history} />

            <h3 className="mt-5 mb-3 font-display text-lg">Sightings</h3>
            {groups.length === 0 ? (
              <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted-foreground">
                No checks recorded yet. Count this tag to save time and location.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map((group) => (
                  <section key={group.key}>
                    <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {group.label}
                    </h4>
                    <div className="flex flex-col gap-2">
                      {group.items.map((sighting) => (
                        <SightingRow
                          key={sighting.id}
                          sighting={sighting}
                          onRemove={() => onRemoveSighting(sighting.id)}
                          onLocate={() => void onLocate(sighting.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <footer className="flex gap-2 border-t border-border px-5 py-4">
            <Button variant="outline" className="flex-1" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Edit eartag
            </Button>
            <Button variant="danger" onClick={() => setConfirmRemove(true)}>
              <Trash2 className="size-4" />
              Remove
            </Button>
          </footer>

          {editing ? (
            <div className="absolute inset-0 overflow-y-auto bg-background px-5 py-5">
              <h3 className="font-display mb-1 text-xl">Edit eartag</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Tag, name, and notes for this cow.
              </p>
              <CowForm
                initial={cow}
                submitLabel="Save"
                onCancel={() => setEditing(false)}
                onSubmit={(draft) => {
                  onSave(cow.id, draft);
                  setEditing(false);
                }}
              />
            </div>
          ) : null}

          {confirmRemove ? (
            <div className="absolute inset-0 flex items-end bg-leather/40 sm:items-center">
              <div className="w-full rounded-t-3xl bg-background p-5 sm:rounded-3xl">
                <h3 className="font-display text-xl">Remove {cow.tag}?</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  This deletes the tag and every past sighting. You can add it back later, but
                  the history is gone.
                </p>
                <div className="mt-5 flex gap-2">
                  <Button
                    variant="danger"
                    size="lg"
                    className="flex-1"
                    onClick={() => {
                      onRemoveCow(cow);
                      setConfirmRemove(false);
                    }}
                  >
                    Remove from herd
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => setConfirmRemove(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}

function SightingRow({
  sighting,
  onRemove,
  onLocate,
}: {
  sighting: Sighting;
  onRemove: () => void;
  onLocate: () => void;
}) {
  const located = sighting.lat != null && sighting.lng != null;
  const accuracy = formatAccuracy(sighting.accuracy);

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-card px-3 py-3 shadow-[var(--shadow-border)]">
      <div className="min-w-0">
        <p className="text-sm font-medium">{formatSightingStamp(sighting.at)}</p>
        {located ? (
          <a
            href={mapsUrl(sighting.lat!, sighting.lng!)}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary"
          >
            <MapPin className="size-3.5" />
            {formatCoords(sighting.lat!, sighting.lng!)}
            {accuracy ? ` · ${accuracy}` : ""}
          </a>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">No location saved</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        {located ? null : (
          <Button variant="ghost" onClick={onLocate}>
            Pin
          </Button>
        )}
        <Button variant="ghost" onClick={onRemove} aria-label="Remove this sighting">
          Undo
        </Button>
      </div>
    </div>
  );
}
