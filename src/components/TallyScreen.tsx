import {
  Camera,
  Download,
  Ellipsis,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useHerd } from "../hooks/useHerd";
import { useInstall } from "../hooks/useInstall";
import { useOnline } from "../hooks/useOnline";
import { useToasts } from "../hooks/useToasts";
import { downloadCsv, formatImportSummary, herdToCsv } from "../lib/csv";
import { formatHeaderDate } from "../lib/dates";
import { warmupOcr } from "../lib/ocr";
import {
  countedTodayCount,
  cowCountedToday,
  filterHerd,
  lastSighting,
} from "../lib/tags";
import type { Cow, HerdFilter } from "../types";
import { CameraScan } from "./CameraScan";
import { CowForm } from "./CowForm";
import { CowRow } from "./CowRow";
import { CowSheet } from "./CowSheet";
import { ImportCsvSheet } from "./ImportCsvSheet";
import { InstallBanner, StatusChip } from "./InstallBanner";
import { Toasts } from "./Toasts";
import { Button, IconButton, Sheet } from "./ui";

const FILTERS: { id: HerdFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "missing", label: "Missing" },
  { id: "counted", label: "Counted" },
];

const BANNER_KEY = "herd-check-banner-dismissed";

export function TallyScreen({
  offlineReady,
  onOfflineReady,
}: {
  offlineReady: boolean;
  onOfflineReady: () => void;
}) {
  const herd = useHerd();
  const online = useOnline();
  const install = useInstall();
  const { toasts, push, dismiss } = useToasts();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [selected, setSelected] = useState<Cow | null>(null);
  const [locating, setLocating] = useState<string[]>([]);
  const [bannerOpen, setBannerOpen] = useState(() => {
    try {
      return localStorage.getItem(BANNER_KEY) !== "1";
    } catch {
      return true;
    }
  });

  const counted = countedTodayCount(herd.cows, herd.sightings);
  const visible = useMemo(
    () => filterHerd(herd.cows, herd.sightings, herd.filter, herd.query),
    [herd.cows, herd.sightings, herd.filter, herd.query],
  );

  const recordCount = async (cow: Cow) => {
    setLocating((ids) => [...ids, cow.id]);
    try {
      if (navigator.vibrate) navigator.vibrate(12);
      await herd.markSeen(cow.id);
      push(`Counted ${cow.tag}`);
    } finally {
      setLocating((ids) => ids.filter((id) => id !== cow.id));
    }
  };

  const toggleCount = async (cow: Cow) => {
    if (cowCountedToday(herd.sightings, cow.id)) {
      herd.undoToday(cow.id);
      push(`Unchecked ${cow.tag}`);
      return;
    }
    await recordCount(cow);
  };

  const addAndCount = (tag: string) => {
    try {
      const cow = herd.addCow({ tag });
      void toggleCount(cow);
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not add tag", "error");
    }
  };

  const dismissBanner = () => {
    setBannerOpen(false);
    try {
      localStorage.setItem(BANNER_KEY, "1");
    } catch {
      /* ignore quota / private mode */
    }
  };

  if (!herd.ready) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-3 px-4 pt-8">
        <h1 className="font-display text-2xl font-medium tracking-tight">Herd Check</h1>
        <p className="text-sm text-muted-foreground">Loading today's tally</p>
        <div className="mt-2 h-1.5 rounded-full bg-muted" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-muted/80" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-6 pb-8">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-medium tracking-tight">Herd Check</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatHeaderDate()}</p>
          <div className="mt-2">
            <StatusChip online={online} offlineReady={offlineReady || install.offlineReady} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            label="Open camera to read an eartag"
            onClick={() => {
              warmupOcr();
              setCameraOpen(true);
            }}
          >
            <Camera className="size-5" />
          </IconButton>
          <div className="relative">
            <IconButton label="More" onClick={() => setMenuOpen((v) => !v)}>
              <Ellipsis className="size-5" />
            </IconButton>
            {menuOpen ? (
              <div className="absolute top-12 right-0 z-20 w-56 overflow-hidden rounded-2xl bg-card py-1 shadow-[var(--shadow-lift)]">
                <button
                  type="button"
                  aria-hidden
                  className="fixed inset-0 z-[-1] cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setAddOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Add eartag
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    void (async () => {
                      try {
                        const result = await herd.loadRanchHerd();
                        push(formatImportSummary(result, "replace"));
                      } catch (error) {
                        push(
                          error instanceof Error ? error.message : "Could not load ranch herd",
                          "error",
                        );
                      }
                    })();
                  }}
                >
                  Load ranch herd
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    herd.loadSampleHerd();
                    push("Sample herd loaded");
                  }}
                >
                  Load sample herd
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    setImportOpen(true);
                  }}
                >
                  <Upload className="size-4" /> Import CSV
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    downloadCsv(
                      `herd-check-${new Date().toISOString().slice(0, 10)}.csv`,
                      herdToCsv(herd.cows, herd.sightings),
                    );
                    push("CSV exported");
                  }}
                >
                  <Download className="size-4" /> Export CSV
                </MenuItem>
                <MenuItem
                  danger
                  onClick={() => {
                    setMenuOpen(false);
                    herd.clearHerd();
                    push("Herd cleared");
                  }}
                >
                  <Trash2 className="size-4" /> Clear herd
                </MenuItem>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-4">
        <InstallBanner
          show={bannerOpen}
          offlineReady={offlineReady || install.offlineReady}
          online={online}
          canInstall={install.canInstall}
          iosHint={install.iosHint}
          onInstall={() => {
            void install.promptInstall();
            onOfflineReady();
          }}
          onDismiss={dismissBanner}
        />
      </div>

      <Progress counted={counted} total={herd.cows.length} />

      <label className="relative mt-4 block">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={herd.query}
          onChange={(e) => herd.setQuery(e.target.value)}
          placeholder="Find a tag"
          className="h-12 w-full rounded-xl border border-border bg-card pr-3 pl-9 text-base"
          inputMode="search"
          autoCapitalize="characters"
          autoCorrect="off"
        />
      </label>

      <div className="mt-3 flex gap-1.5">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => herd.setFilter(filter.id)}
            className={`h-9 rounded-full px-3.5 text-sm font-medium ${
              herd.filter === filter.id
                ? "bg-leather text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <main className="mt-4 flex flex-1 flex-col gap-2">
        {herd.cows.length === 0 ? (
          <EmptyState
            onAdd={() => setAddOpen(true)}
            onRanch={() => {
              void (async () => {
                try {
                  const result = await herd.loadRanchHerd();
                  push(formatImportSummary(result, "replace"));
                } catch (error) {
                  push(
                    error instanceof Error ? error.message : "Could not load ranch herd",
                    "error",
                  );
                }
              })();
            }}
            onSample={() => {
              herd.loadSampleHerd();
              push("Sample herd loaded");
            }}
            onImport={() => setImportOpen(true)}
          />
        ) : visible.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {herd.query.trim()
              ? "No tags match that search."
              : herd.filter === "counted"
                ? "No tags counted yet today."
                : "Whole herd counted today."}
          </p>
        ) : (
          visible.map((cow) => (
            <CowRow
              key={cow.id}
              cow={cow}
              counted={cowCountedToday(herd.sightings, cow.id)}
              last={lastSighting(herd.sightings, cow.id)}
              locating={locating.includes(cow.id)}
              onToggle={() => void toggleCount(cow)}
              onOpen={() => setSelected(cow)}
            />
          ))
        )}
      </main>

      <div className="sticky bottom-0 mt-4 flex gap-2 bg-background/90 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        <Button size="lg" className="flex-1" onClick={() => setAddOpen(true)}>
          <Plus className="size-5" />
          Add eartag
        </Button>
        <Button
          size="lg"
          variant="leather"
          aria-label="Open camera to read an eartag"
          onClick={() => {
            warmupOcr();
            setCameraOpen(true);
          }}
        >
          <Camera className="size-5" />
          Camera
        </Button>
      </div>

      <Sheet open={addOpen} title="Add eartag" onClose={() => setAddOpen(false)}>
        <div className="px-5 pt-5 pb-6">
          <h2 className="font-display text-xl">Add eartag</h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            New tags show up on today's tally as not yet counted.
          </p>
          <CowForm
            submitLabel="Add to herd"
            onCancel={() => setAddOpen(false)}
            onSubmit={(draft) => {
              try {
                const cow = herd.addCow(draft);
                push(`Added ${cow.tag}`);
                setAddOpen(false);
              } catch (error) {
                push(error instanceof Error ? error.message : "Could not add tag", "error");
              }
            }}
            extraAction={
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setAddOpen(false);
                  warmupOcr();
                  setCameraOpen(true);
                }}
              >
                <Camera className="size-4" />
                Scan a tag
              </Button>
            }
          />
        </div>
      </Sheet>

      <ImportCsvSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(text, mode) => {
          const result = herd.importCsvText(text, mode);
          push(formatImportSummary(result, mode));
          return result;
        }}
      />

      <CowSheet
        cow={selected ? herd.cows.find((c) => c.id === selected.id) ?? selected : null}
        sightings={herd.sightings}
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        onCount={(cow) => void recordCount(cow)}
        onUndo={(cow) => {
          herd.undoToday(cow.id);
          push("Removed today's checks");
        }}
        onRemoveSighting={(id) => {
          herd.removeSighting(id);
          push("Sighting removed");
        }}
        onLocate={async (id) => {
          const ok = await herd.attachGeo(id);
          push(ok ? "Location saved" : "No GPS fix — count still saved");
        }}
        onSave={(id, draft) => {
          try {
            herd.updateCow(id, draft);
            push("Saved");
          } catch (error) {
            push(error instanceof Error ? error.message : "Could not save", "error");
          }
        }}
        onRemoveCow={(cow) => {
          herd.removeCow(cow.id);
          setSelected(null);
          push(`Removed ${cow.tag}`);
        }}
      />

      <CameraScan
        open={cameraOpen}
        cows={herd.cows}
        onClose={() => setCameraOpen(false)}
        onCount={(cow) => void recordCount(cow)}
        onAddAndCount={addAndCount}
      />

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function Progress({ counted, total }: { counted: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((counted / total) * 100);
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-sm font-medium">Today's tally</p>
        <p className="font-tag text-sm">
          {counted}/{total}
        </p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EmptyState({
  onAdd,
  onRanch,
  onSample,
  onImport,
}: {
  onAdd: () => void;
  onRanch: () => void;
  onSample: () => void;
  onImport: () => void;
}) {
  return (
    <div className="mt-6 rounded-3xl bg-card px-6 py-10 text-center shadow-[var(--shadow-border)]">
      <h2 className="font-display text-xl">No tags yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Add an eartag, load the ranch's Active herd, import a CSV, or try the sample list.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        <Button size="lg" onClick={onAdd}>
          Add an eartag
        </Button>
        <Button size="lg" variant="leather" onClick={onRanch}>
          Load ranch herd
        </Button>
        <Button variant="outline" onClick={onImport}>
          Import CSV
        </Button>
        <Button variant="ghost" onClick={onSample}>
          Load a sample herd
        </Button>
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm ${
        danger ? "text-destructive" : ""
      }`}
    >
      {children}
    </button>
  );
}
