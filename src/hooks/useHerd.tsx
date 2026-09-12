import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  deleteCow,
  deleteSighting,
  loadState,
  openHerdDb,
  putCow,
  putSighting,
  replaceHerd,
  type HerdDatabase,
} from "../db/database";
import { isToday } from "../lib/dates";
import { readGeo } from "../lib/geo";
import { createId } from "../lib/ids";
import { createSampleHerd } from "../lib/sample";
import { isDuplicateTag, normalizeTag } from "../lib/tags";
import type { Cow, CowDraft, HerdFilter, Sighting } from "../types";

interface HerdState {
  ready: boolean;
  cows: Cow[];
  sightings: Sighting[];
  filter: HerdFilter;
  query: string;
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
  clearHerd: () => void;
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const database = await openHerdDb();
      const loaded = await loadState(database);
      if (cancelled) return;
      setDb(database);
      if (!loaded.seeded && loaded.cows.length === 0) {
        const sample = createSampleHerd();
        await replaceHerd(database, sample.cows, sample.sightings);
        setState({
          ready: true,
          cows: sample.cows,
          sightings: sample.sightings,
          filter: "all",
          query: "",
        });
        return;
      }
      setState({
        ready: true,
        cows: loaded.cows,
        sightings: loaded.sightings,
        filter: "all",
        query: "",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addCow = useCallback(
    (draft: CowDraft) => {
      const tag = normalizeTag(draft.tag);
      if (!tag) throw new Error("Eartag is required.");
      if (isDuplicateTag(state.cows, tag)) {
        throw new Error(`Tag ${tag} is already in the herd.`);
      }
      const cow: Cow = {
        id: createId("cow"),
        tag,
        name: draft.name?.trim() ?? "",
        notes: draft.notes?.trim() ?? "",
        createdAt: Date.now(),
      };
      setState((prev) => ({ ...prev, cows: [...prev.cows, cow] }));
      if (db) void putCow(db, cow);
      return cow;
    },
    [db, state.cows],
  );

  const updateCow = useCallback(
    (id: string, draft: CowDraft) => {
      const tag = normalizeTag(draft.tag);
      if (!tag) throw new Error("Eartag is required.");
      if (isDuplicateTag(state.cows, tag, id)) {
        throw new Error(`Tag ${tag} is already in the herd.`);
      }
      setState((prev) => ({
        ...prev,
        cows: prev.cows.map((cow) =>
          cow.id === id
            ? {
                ...cow,
                tag,
                name: draft.name?.trim() ?? "",
                notes: draft.notes?.trim() ?? "",
              }
            : cow,
        ),
      }));
      const current = state.cows.find((cow) => cow.id === id);
      if (db && current) {
        void putCow(db, {
          ...current,
          tag,
          name: draft.name?.trim() ?? "",
          notes: draft.notes?.trim() ?? "",
        });
      }
    },
    [db, state.cows],
  );

  const removeCow = useCallback(
    (id: string) => {
      setState((prev) => ({
        ...prev,
        cows: prev.cows.filter((cow) => cow.id !== id),
        sightings: prev.sightings.filter((s) => s.cowId !== id),
      }));
      if (db) void deleteCow(db, id);
    },
    [db],
  );

  const markSeen = useCallback(
    async (cowId: string) => {
      const sighting: Sighting = {
        id: createId("see"),
        cowId,
        at: Date.now(),
        lat: null,
        lng: null,
        accuracy: null,
      };
      setState((prev) => ({
        ...prev,
        sightings: [sighting, ...prev.sightings],
      }));
      if (db) void putSighting(db, sighting);

      const geo = await readGeo();
      if (!geo) return sighting;
      const located = { ...sighting, ...geo };
      setState((prev) => ({
        ...prev,
        sightings: prev.sightings.map((s) => (s.id === sighting.id ? located : s)),
      }));
      if (db) void putSighting(db, located);
      return located;
    },
    [db],
  );

  const undoToday = useCallback(
    (cowId: string) => {
      setState((prev) => {
        const removed = prev.sightings.filter(
          (s) => s.cowId === cowId && isToday(s.at),
        );
        if (db) {
          for (const s of removed) void deleteSighting(db, s.id);
        }
        return {
          ...prev,
          sightings: prev.sightings.filter(
            (s) => !(s.cowId === cowId && isToday(s.at)),
          ),
        };
      });
    },
    [db],
  );

  const removeSightingRecord = useCallback(
    (id: string) => {
      setState((prev) => ({
        ...prev,
        sightings: prev.sightings.filter((s) => s.id !== id),
      }));
      if (db) void deleteSighting(db, id);
    },
    [db],
  );

  const attachGeo = useCallback(
    async (id: string) => {
      const geo = await readGeo();
      if (!geo) return false;
      setState((prev) => ({
        ...prev,
        sightings: prev.sightings.map((s) =>
          s.id === id ? { ...s, ...geo } : s,
        ),
      }));
      const current = state.sightings.find((s) => s.id === id);
      if (db && current) void putSighting(db, { ...current, ...geo });
      return true;
    },
    [db, state.sightings],
  );

  const loadSampleHerd = useCallback(() => {
    const sample = createSampleHerd();
    setState((prev) => ({
      ...prev,
      cows: sample.cows,
      sightings: sample.sightings,
      filter: "all",
      query: "",
    }));
    if (db) void replaceHerd(db, sample.cows, sample.sightings);
  }, [db]);

  const clearHerd = useCallback(() => {
    setState((prev) => ({
      ...prev,
      cows: [],
      sightings: [],
      filter: "all",
      query: "",
    }));
    if (db) void replaceHerd(db, [], []);
  }, [db]);

  const api = useMemo<HerdApi>(
    () => ({
      ...state,
      setFilter: (filter) => setState((prev) => ({ ...prev, filter })),
      setQuery: (query) => setState((prev) => ({ ...prev, query })),
      addCow,
      updateCow,
      removeCow,
      markSeen,
      undoToday,
      removeSighting: removeSightingRecord,
      attachGeo,
      loadSampleHerd,
      clearHerd,
    }),
    [
      addCow,
      attachGeo,
      clearHerd,
      loadSampleHerd,
      markSeen,
      removeCow,
      removeSightingRecord,
      state,
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
