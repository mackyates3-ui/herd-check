import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getMeta,
  loadState,
  openHerdDb,
  putCow,
  putSighting,
  replaceHerd,
  setMeta,
  type HerdDatabase,
} from "../db/database";
import {
  applyHerdImport,
  parseHerdCsv,
  RANCH_HERD_URL,
  type AppliedImport,
  type ImportMode,
} from "../lib/csv";
import { isToday } from "../lib/dates";
import { readGeo } from "../lib/geo";
import { createId } from "../lib/ids";
import { createSampleHerd } from "../lib/sample";
import {
  asSyncCow,
  asSyncSighting,
  cowIsLive,
  mergeHerds,
  sightingIsLive,
  type SyncCow,
  type SyncSighting,
} from "../lib/sync/merge";
import { applyLocalSnapshot } from "../lib/sync/local";
import {
  createSharedHerd,
  joinSharedHerd,
  pushSharedHerd,
  syncErrorMessage,
  type SyncClientResult,
} from "../lib/sync/client";
import { isDuplicateTag, normalizeTag } from "../lib/tags";
import type { Cow, CowDraft, HerdFilter, Sighting } from "../types";

interface HerdState {
  ready: boolean;
  cows: SyncCow[];
  sightings: SyncSighting[];
  filter: HerdFilter;
  query: string;
}

interface SyncView {
  code: string | null;
  pending: number;
  lastSyncedAt: number | null;
  error: string | null;
}

interface HerdApi extends HerdState {
  setFilter: (filter: HerdFilter) => void;
  setQuery: (query: string) => void;
  addCow: (draft: CowDraft) => Cow;
  updateCow: (id: string, draft: CowDraft) => void;
  removeCow: (id: string) => void;
  markSeen: (cowId: string) => Promise<Sighting>;
  undoToday: (cowId: string) => void;
  removeSighting: (id: string) => void;
  attachGeo: (id: string) => Promise<boolean>;
  loadSampleHerd: () => void;
  loadRanchHerd: () => Promise<AppliedImport & { skipped: number }>;
  importCsvText: (text: string, mode: ImportMode) => AppliedImport & { skipped: number };
  clearHerd: () => void;
  syncCode: string | null;
  syncPending: number;
  lastSyncedAt: number | null;
  syncError: string | null;
  shareHerd: () => Promise<SyncClientResult>;
  joinHerd: (code: string) => Promise<SyncClientResult>;
  syncNow: () => Promise<SyncClientResult | null>;
  stopSharing: () => void;
}

const HerdContext = createContext<HerdApi | null>(null);

export function HerdProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<HerdDatabase | null>(null);
  const [state, setState] = useState<HerdState>({
    ready: false,
    cows: [],
    sightings: [],
    filter: "all",
    query: "",
  });
  const [syncView, setSyncView] = useState<SyncView>({
    code: null,
    pending: 0,
    lastSyncedAt: null,
    error: null,
  });
  const fullRef = useRef(state);
  const dbRef = useRef<HerdDatabase | null>(null);
  const syncRef = useRef({
    code: null as string | null,
    epoch: 0,
    acked: 0,
    syncing: false,
    queued: false,
  });
  dbRef.current = db;

  const rememberPending = useCallback((pending: number, lastSyncedAt: number | null, error: string | null) => {
    setSyncView((prev) => ({
      code: syncRef.current.code,
      pending,
      lastSyncedAt: lastSyncedAt ?? prev.lastSyncedAt,
      error,
    }));
    const database = dbRef.current;
    if (!database) return;
    void setMeta(database, "syncPending", pending);
    if (lastSyncedAt != null) void setMeta(database, "lastSyncedAt", lastSyncedAt);
  }, []);

  const markDirty = useCallback(() => {
    const book = syncRef.current;
    book.epoch += 1;
    const pending = book.epoch - book.acked;
    rememberPending(pending, null, null);
  }, [rememberPending]);

  const writeFull = useCallback((next: HerdState) => {
    fullRef.current = next;
    setState(next);
  }, []);

  const runSync = useCallback(async (): Promise<SyncClientResult | null> => {
    const book = syncRef.current;
    const code = book.code;
    const database = dbRef.current;
    if (!code || !database) return null;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      rememberPending(book.epoch - book.acked, null, null);
      return { ok: false, error: "unreachable" };
    }
    if (book.syncing) {
      book.queued = true;
      return null;
    }
    book.syncing = true;
    const started = book.epoch;
    const result = await pushSharedHerd(code, fullRef.current.cows, fullRef.current.sightings);
    if (!result.ok) {
      book.syncing = false;
      rememberPending(book.epoch - book.acked, null, syncErrorMessage(result.error));
      if (book.queued) {
        book.queued = false;
        void runSync();
      }
      return result;
    }
    const merged = mergeHerds(
      { cows: fullRef.current.cows.map(asSyncCow), sightings: fullRef.current.sightings.map(asSyncSighting) },
      { cows: result.cows, sightings: result.sightings },
    );
    const next = { ...fullRef.current, cows: merged.cows, sightings: merged.sightings };
    writeFull(next);
    await replaceHerd(database, merged.cows, merged.sightings);
    if (book.epoch === started) book.acked = started;
    const pending = book.epoch - book.acked;
    const syncedAt = Date.now();
    book.syncing = false;
    rememberPending(pending, syncedAt, null);
    if (book.queued || pending > 0) {
      book.queued = false;
      void runSync();
    }
    return { ok: true, code, cows: merged.cows, sightings: merged.sightings };
  }, [rememberPending, writeFull]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const database = await openHerdDb();
      const loaded = await loadState(database);
      if (cancelled) return;
      const code = await getMeta<string>(database, "syncCode");
      const pending = (await getMeta<number>(database, "syncPending")) ?? 0;
      const lastSyncedAt = await getMeta<number>(database, "lastSyncedAt");
      setDb(database);
      dbRef.current = database;
      syncRef.current.code = code;
      syncRef.current.epoch = pending;
      syncRef.current.acked = 0;
      setSyncView({ code, pending, lastSyncedAt, error: null });
      if (!loaded.seeded && loaded.cows.length === 0) {
        const sample = createSampleHerd();
        const stamped = applyLocalSnapshot([], [], sample.cows, sample.sightings, Date.now());
        await replaceHerd(database, stamped.cows, stamped.sightings);
        const next = {
          ready: true,
          cows: stamped.cows,
          sightings: stamped.sightings,
          filter: "all" as const,
          query: "",
        };
        fullRef.current = next;
        setState(next);
        return;
      }
      const next = {
        ready: true,
        cows: loaded.cows.map(asSyncCow),
        sightings: loaded.sightings.map(asSyncSighting),
        filter: "all" as const,
        query: "",
      };
      fullRef.current = next;
      setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!syncView.code) return;
    const tick = () => {
      void runSync();
    };
    const interval = window.setInterval(tick, 12000);
    window.addEventListener("online", tick);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [runSync, syncView.code]);

  const persistCow = useCallback((cow: SyncCow) => {
    const database = dbRef.current;
    if (database) void putCow(database, cow);
  }, []);

  const persistSighting = useCallback((sighting: SyncSighting) => {
    const database = dbRef.current;
    if (database) void putSighting(database, sighting);
  }, []);

  const addCow = useCallback(
    (draft: CowDraft) => {
      const tag = normalizeTag(draft.tag);
      if (!tag) throw new Error("Eartag is required.");
      const live = fullRef.current.cows.filter(cowIsLive);
      if (isDuplicateTag(live, tag)) throw new Error(`Tag ${tag} is already in the herd.`);
      const now = Date.now();
      const animal: SyncCow = {
        id: createId("cow"),
        tag,
        name: draft.name?.trim() ?? "",
        notes: draft.notes?.trim() ?? "",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      const next = { ...fullRef.current, cows: [...fullRef.current.cows, animal] };
      writeFull(next);
      persistCow(animal);
      markDirty();
      return animal;
    },
    [markDirty, persistCow, writeFull],
  );

  const updateCow = useCallback(
    (id: string, draft: CowDraft) => {
      const tag = normalizeTag(draft.tag);
      if (!tag) throw new Error("Eartag is required.");
      const live = fullRef.current.cows.filter(cowIsLive);
      if (isDuplicateTag(live, tag, id)) throw new Error(`Tag ${tag} is already in the herd.`);
      const now = Date.now();
      let saved: SyncCow | null = null;
      const next = {
        ...fullRef.current,
        cows: fullRef.current.cows.map((cow) => {
          if (cow.id !== id) return cow;
          saved = {
            ...cow,
            tag,
            name: draft.name?.trim() ?? "",
            notes: draft.notes?.trim() ?? "",
            updatedAt: now,
            deletedAt: null,
          };
          return saved;
        }),
      };
      if (!saved) return;
      writeFull(next);
      persistCow(saved);
      markDirty();
    },
    [markDirty, persistCow, writeFull],
  );

  const removeCow = useCallback(
    (id: string) => {
      const now = Date.now();
      const next = {
        ...fullRef.current,
        cows: fullRef.current.cows.map((cow) =>
          cow.id === id ? { ...cow, deletedAt: now, updatedAt: now } : cow,
        ),
        sightings: fullRef.current.sightings.map((sighting) =>
          sighting.cowId === id && sightingIsLive(sighting)
            ? { ...sighting, deletedAt: now, updatedAt: now }
            : sighting,
        ),
      };
      writeFull(next);
      const database = dbRef.current;
      if (database) void replaceHerd(database, next.cows, next.sightings);
      markDirty();
    },
    [markDirty, writeFull],
  );

  const markSeen = useCallback(
    async (cowId: string) => {
      const now = Date.now();
      const sighting: SyncSighting = {
        id: createId("see"),
        cowId,
        at: now,
        lat: null,
        lng: null,
        accuracy: null,
        updatedAt: now,
        deletedAt: null,
      };
      writeFull({
        ...fullRef.current,
        sightings: [sighting, ...fullRef.current.sightings],
      });
      persistSighting(sighting);
      markDirty();

      const geo = await readGeo();
      if (!geo) return sighting;
      const located = { ...sighting, ...geo, updatedAt: Date.now() };
      writeFull({
        ...fullRef.current,
        sightings: fullRef.current.sightings.map((item) => (item.id === sighting.id ? located : item)),
      });
      persistSighting(located);
      markDirty();
      return located;
    },
    [markDirty, persistSighting, writeFull],
  );

  const undoToday = useCallback(
    (cowId: string) => {
      const now = Date.now();
      const next = {
        ...fullRef.current,
        sightings: fullRef.current.sightings.map((sighting) =>
          sighting.cowId === cowId && sightingIsLive(sighting) && isToday(sighting.at)
            ? { ...sighting, deletedAt: now, updatedAt: now }
            : sighting,
        ),
      };
      writeFull(next);
      for (const sighting of next.sightings) {
        if (sighting.cowId === cowId && sighting.deletedAt === now) persistSighting(sighting);
      }
      markDirty();
    },
    [markDirty, persistSighting, writeFull],
  );

  const removeSightingRecord = useCallback(
    (id: string) => {
      const now = Date.now();
      let saved: SyncSighting | null = null;
      const next = {
        ...fullRef.current,
        sightings: fullRef.current.sightings.map((sighting) => {
          if (sighting.id !== id) return sighting;
          saved = { ...sighting, deletedAt: now, updatedAt: now };
          return saved;
        }),
      };
      writeFull(next);
      if (saved) persistSighting(saved);
      markDirty();
    },
    [markDirty, persistSighting, writeFull],
  );

  const attachGeo = useCallback(
    async (id: string) => {
      const geo = await readGeo();
      if (!geo) return false;
      const now = Date.now();
      let saved: SyncSighting | null = null;
      const next = {
        ...fullRef.current,
        sightings: fullRef.current.sightings.map((sighting) => {
          if (sighting.id !== id) return sighting;
          saved = { ...sighting, ...geo, updatedAt: now };
          return saved;
        }),
      };
      writeFull(next);
      if (saved) persistSighting(saved);
      markDirty();
      return true;
    },
    [markDirty, persistSighting, writeFull],
  );

  const commitHerd = useCallback(
    (cows: Cow[], sightings: Sighting[]) => {
      const snapshot = applyLocalSnapshot(
        fullRef.current.cows,
        fullRef.current.sightings,
        cows,
        sightings,
        Date.now(),
      );
      const next = {
        ...fullRef.current,
        cows: snapshot.cows,
        sightings: snapshot.sightings,
        filter: "all" as const,
        query: "",
      };
      writeFull(next);
      const database = dbRef.current;
      if (database) void replaceHerd(database, snapshot.cows, snapshot.sightings);
      markDirty();
    },
    [markDirty, writeFull],
  );

  const loadSampleHerd = useCallback(() => {
    const sample = createSampleHerd();
    commitHerd(sample.cows, sample.sightings);
  }, [commitHerd]);

  const importCsvText = useCallback(
    (text: string, mode: ImportMode): AppliedImport & { skipped: number } => {
      const parsed = parseHerdCsv(text);
      if (!parsed.ok) throw new Error(parsed.error);
      const liveCows = fullRef.current.cows.filter(cowIsLive);
      const liveSightings = fullRef.current.sightings.filter(sightingIsLive);
      const applied =
        mode === "replace"
          ? applyHerdImport([], [], parsed.rows, "replace")
          : applyHerdImport(liveCows, liveSightings, parsed.rows, "merge");
      commitHerd(applied.cows, applied.sightings);
      return { ...applied, skipped: parsed.skipped };
    },
    [commitHerd],
  );

  const loadRanchHerd = useCallback(async () => {
    const response = await fetch(RANCH_HERD_URL);
    if (!response.ok) throw new Error("Could not load the ranch herd file.");
    const text = await response.text();
    return importCsvText(text, "replace");
  }, [importCsvText]);

  const clearHerd = useCallback(() => {
    commitHerd([], []);
  }, [commitHerd]);

  const shareHerd = useCallback(async (): Promise<SyncClientResult> => {
    const result = await createSharedHerd(fullRef.current.cows, fullRef.current.sightings);
    if (!result.ok) {
      rememberPending(syncRef.current.epoch - syncRef.current.acked, null, syncErrorMessage(result.error));
      return result;
    }
    const database = dbRef.current;
    syncRef.current.code = result.code;
    syncRef.current.acked = syncRef.current.epoch;
    if (database) {
      await setMeta(database, "syncCode", result.code);
      await setMeta(database, "syncPending", 0);
      await setMeta(database, "lastSyncedAt", Date.now());
    }
    const merged = mergeHerds(
      { cows: fullRef.current.cows.map(asSyncCow), sightings: fullRef.current.sightings.map(asSyncSighting) },
      result,
    );
    writeFull({ ...fullRef.current, cows: merged.cows, sightings: merged.sightings });
    if (database) await replaceHerd(database, merged.cows, merged.sightings);
    setSyncView({ code: result.code, pending: 0, lastSyncedAt: Date.now(), error: null });
    return result;
  }, [rememberPending, writeFull]);

  const joinHerd = useCallback(
    async (code: string): Promise<SyncClientResult> => {
      const remote = await joinSharedHerd(code);
      if (!remote.ok) {
        rememberPending(syncRef.current.epoch - syncRef.current.acked, null, syncErrorMessage(remote.error));
        return remote;
      }
      const merged = mergeHerds(
        { cows: fullRef.current.cows.map(asSyncCow), sightings: fullRef.current.sightings.map(asSyncSighting) },
        remote,
      );
      const database = dbRef.current;
      writeFull({ ...fullRef.current, cows: merged.cows, sightings: merged.sightings });
      if (database) await replaceHerd(database, merged.cows, merged.sightings);
      syncRef.current.code = remote.code;
      if (database) await setMeta(database, "syncCode", remote.code);
      setSyncView((prev) => ({ ...prev, code: remote.code, error: null }));
      const pushed = await runSync();
      return pushed ?? remote;
    },
    [rememberPending, runSync, writeFull],
  );

  const stopSharing = useCallback(() => {
    syncRef.current.code = null;
    syncRef.current.acked = syncRef.current.epoch;
    const database = dbRef.current;
    if (database) {
      void setMeta(database, "syncCode", null);
      void setMeta(database, "syncPending", 0);
    }
    setSyncView({ code: null, pending: 0, lastSyncedAt: null, error: null });
  }, []);

  const liveCows = useMemo(() => state.cows.filter(cowIsLive), [state.cows]);
  const liveSightings = useMemo(() => state.sightings.filter(sightingIsLive), [state.sightings]);

  const api = useMemo<HerdApi>(
    () => ({
      ...state,
      cows: liveCows,
      sightings: liveSightings,
      setFilter: (filter) => {
        const next = { ...fullRef.current, filter };
        fullRef.current = next;
        setState(next);
      },
      setQuery: (query) => {
        const next = { ...fullRef.current, query };
        fullRef.current = next;
        setState(next);
      },
      addCow,
      updateCow,
      removeCow,
      markSeen,
      undoToday,
      removeSighting: removeSightingRecord,
      attachGeo,
      loadSampleHerd,
      loadRanchHerd,
      importCsvText,
      clearHerd,
      syncCode: syncView.code,
      syncPending: syncView.pending,
      lastSyncedAt: syncView.lastSyncedAt,
      syncError: syncView.error,
      shareHerd,
      joinHerd,
      syncNow: runSync,
      stopSharing,
    }),
    [
      addCow,
      attachGeo,
      clearHerd,
      importCsvText,
      joinHerd,
      liveCows,
      liveSightings,
      loadRanchHerd,
      loadSampleHerd,
      markSeen,
      removeCow,
      removeSightingRecord,
      runSync,
      shareHerd,
      state,
      stopSharing,
      syncView,
      undoToday,
      updateCow,
    ],
  );

  return <HerdContext.Provider value={api}>{children}</HerdContext.Provider>;
}

export function useHerd(): HerdApi {
  const ctx = useContext(HerdContext);
  if (!ctx) throw new Error("useHerd must be used inside HerdProvider");
  return ctx;
}
