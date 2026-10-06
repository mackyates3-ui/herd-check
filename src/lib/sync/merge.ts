import { normalizeTag } from "../tags";
import type { Cow, Sighting } from "../../types";

export interface SyncCow {
  id: string;
  tag: string;
  name: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface SyncSighting {
  id: string;
  cowId: string;
  at: number;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  updatedAt: number;
  deletedAt: number | null;
}

export interface HerdSnapshot {
  cows: SyncCow[];
  sightings: SyncSighting[];
}

export function cowIsLive(cow: Pick<SyncCow, "updatedAt" | "deletedAt">): boolean {
  return cow.deletedAt == null || cow.deletedAt < cow.updatedAt;
}

export function sightingIsLive(sighting: Pick<SyncSighting, "updatedAt" | "deletedAt">): boolean {
  return sighting.deletedAt == null || sighting.deletedAt < sighting.updatedAt;
}

export function asSyncCow(cow: Cow): SyncCow {
  const createdAt = finite(cow.createdAt, 0);
  const updatedAt = finite(cow.updatedAt, createdAt);
  return {
    id: cow.id,
    tag: cow.tag?.trim() ?? "",
    name: cow.name ?? "",
    notes: cow.notes ?? "",
    createdAt,
    updatedAt,
    deletedAt: cow.deletedAt == null ? null : finite(cow.deletedAt, updatedAt),
  };
}

export function asSyncSighting(sighting: Sighting): SyncSighting {
  const at = finite(sighting.at, 0);
  const updatedAt = finite(sighting.updatedAt, at);
  return {
    id: sighting.id,
    cowId: sighting.cowId,
    at,
    lat: numberOrNull(sighting.lat),
    lng: numberOrNull(sighting.lng),
    accuracy: numberOrNull(sighting.accuracy),
    updatedAt,
    deletedAt: sighting.deletedAt == null ? null : finite(sighting.deletedAt, updatedAt),
  };
}

/**
 * Combine two herd snapshots. The same cow counted on two phones stays one
 * tally row and keeps both sightings. Edits use the later timestamp. A removal
 * sticks unless a later edit or a later sighting puts the animal back.
 */
export function mergeHerds(left: HerdSnapshot, right: HerdSnapshot): HerdSnapshot {
  const cows = mergeById(left.cows, right.cows, mergeCow);
  const sightings = mergeById(left.sightings, right.sightings, mergeSighting);
  const collapsed = collapseDuplicateTags({ cows, sightings });
  const revived = reviveCountedCows(collapsed);
  return {
    cows: [...revived.cows].sort(byId),
    sightings: [...revived.sightings].sort(byId),
  };
}

export function liveHerd(snapshot: HerdSnapshot): { cows: SyncCow[]; sightings: SyncSighting[] } {
  return {
    cows: snapshot.cows.filter(cowIsLive),
    sightings: snapshot.sightings.filter(sightingIsLive),
  };
}

function mergeById<T extends { id: string }>(
  left: T[],
  right: T[],
  merge: (a: T, b: T) => T,
): T[] {
  const map = new Map<string, T>();
  for (const item of [...left, ...right]) {
    if (!item.id) continue;
    const prev = map.get(item.id);
    map.set(item.id, prev ? merge(prev, item) : item);
  }
  return [...map.values()];
}

function mergeCow(a: SyncCow, b: SyncCow): SyncCow {
  const winner = laterRecord(a, b);
  const createdAt = Math.min(a.createdAt, b.createdAt);
  const deletedAt = laterStamp(a.deletedAt, b.deletedAt);
  if (deletedAt != null && deletedAt >= winner.updatedAt) {
    return { ...winner, createdAt, deletedAt, updatedAt: Math.max(winner.updatedAt, deletedAt) };
  }
  return { ...winner, createdAt, deletedAt: null };
}

function mergeSighting(a: SyncSighting, b: SyncSighting): SyncSighting {
  const winner = laterRecord(a, b);
  const loser = winner === a ? b : a;
  const deletedAt = laterStamp(a.deletedAt, b.deletedAt);
  let lat = winner.lat;
  let lng = winner.lng;
  let accuracy = winner.accuracy;
  if (lat == null && loser.lat != null && sightingIsLive(loser)) {
    lat = loser.lat;
    lng = loser.lng;
    accuracy = loser.accuracy;
  }
  const located = { ...winner, lat, lng, accuracy };
  if (deletedAt != null && deletedAt >= winner.updatedAt) {
    return { ...located, deletedAt, updatedAt: Math.max(winner.updatedAt, deletedAt) };
  }
  return { ...located, deletedAt: null };
}

function collapseDuplicateTags(snapshot: HerdSnapshot): HerdSnapshot {
  const groups = new Map<string, SyncCow[]>();
  for (const cow of snapshot.cows) {
    if (!cowIsLive(cow)) continue;
    const key = normalizeTag(cow.tag);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(cow);
    else groups.set(key, [cow]);
  }

  const remaps = new Map<string, string>();
  const replacements = new Map<string, SyncCow>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const canonical = [...group].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    )[0];
    if (!canonical) continue;
    const newest = [...group].sort(
      (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
    )[0];
    if (!newest) continue;
    const updatedAt = Math.max(...group.map((cow) => cow.updatedAt));
    replacements.set(canonical.id, {
      ...canonical,
      tag: newest.tag,
      name: newest.name,
      notes: newest.notes,
      createdAt: Math.min(...group.map((cow) => cow.createdAt)),
      updatedAt,
      deletedAt: null,
    });
    for (const other of group) {
      if (other.id === canonical.id) continue;
      remaps.set(other.id, canonical.id);
      replacements.set(other.id, {
        ...other,
        deletedAt: updatedAt,
        updatedAt,
      });
    }
  }

  const cows = snapshot.cows.map((cow) => replacements.get(cow.id) ?? cow);
  const sightings = snapshot.sightings.map((sighting) => {
    const nextCow = remaps.get(sighting.cowId);
    if (!nextCow) return sighting;
    const updatedAt = Math.max(sighting.updatedAt, replacements.get(nextCow)?.updatedAt ?? 0);
    if (!sightingIsLive(sighting)) {
      return {
        ...sighting,
        cowId: nextCow,
        updatedAt,
        deletedAt: Math.max(sighting.deletedAt ?? 0, updatedAt),
      };
    }
    return { ...sighting, cowId: nextCow, updatedAt, deletedAt: null };
  });
  return { cows, sightings };
}

function reviveCountedCows(snapshot: HerdSnapshot): HerdSnapshot {
  const cows = snapshot.cows.map((cow) => {
    if (cowIsLive(cow)) return cow;
    const removedAt = cow.deletedAt ?? 0;
    let newest = 0;
    for (const sighting of snapshot.sightings) {
      if (sighting.cowId !== cow.id || !sightingIsLive(sighting)) continue;
      if (sighting.updatedAt > removedAt) newest = Math.max(newest, sighting.updatedAt);
    }
    if (newest === 0) return cow;
    return { ...cow, deletedAt: null, updatedAt: Math.max(cow.updatedAt, newest) };
  });
  return { cows, sightings: snapshot.sightings };
}

function laterRecord<T extends { id: string; updatedAt: number }>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return a.id <= b.id ? a : b;
}

function laterStamp(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

function finite(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
