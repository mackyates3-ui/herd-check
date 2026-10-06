import type { Cow, Sighting } from "../../types";
import { asSyncCow, asSyncSighting, cowIsLive, type SyncCow, type SyncSighting } from "./merge";

/**
 * Turn a desired live herd into a full snapshot. Animals and sightings that
 * disappeared become tombstones so another phone can learn about the removal.
 * Unchanged records keep their old timestamp, so a quiet import does not
 * overwrite a newer edit from the other phone.
 */
export function applyLocalSnapshot(
  prevCows: Cow[],
  prevSightings: Sighting[],
  nextCows: Cow[],
  nextSightings: Sighting[],
  now: number,
): { cows: SyncCow[]; sightings: SyncSighting[] } {
  const previousCows = prevCows.map(asSyncCow);
  const previousSightings = prevSightings.map(asSyncSighting);
  const nextCowIds = new Set(nextCows.map((cow) => cow.id));
  const nextSightingIds = new Set(nextSightings.map((sighting) => sighting.id));

  const cows: SyncCow[] = nextCows.map((cow) => {
    const prev = previousCows.find((item) => item.id === cow.id);
    return stampCow(prev, asSyncCow({ ...cow, deletedAt: null }), now);
  });
  for (const prev of previousCows) {
    if (nextCowIds.has(prev.id)) continue;
    cows.push(cowIsLive(prev) ? { ...prev, deletedAt: now, updatedAt: now } : prev);
  }

  const sightings: SyncSighting[] = nextSightings.map((sighting) => {
    const prev = previousSightings.find((item) => item.id === sighting.id);
    return stampSighting(prev, asSyncSighting({ ...sighting, deletedAt: null }), now);
  });
  for (const prev of previousSightings) {
    if (nextSightingIds.has(prev.id)) continue;
    sightings.push(
      prev.deletedAt != null && prev.deletedAt >= prev.updatedAt
        ? prev
        : { ...prev, deletedAt: now, updatedAt: now },
    );
  }

  return { cows, sightings };
}

function stampCow(prev: SyncCow | undefined, next: SyncCow, now: number): SyncCow {
  if (
    prev &&
    prev.tag === next.tag &&
    prev.name === next.name &&
    prev.notes === next.notes &&
    cowIsLive(prev)
  ) {
    return prev;
  }
  return {
    ...next,
    createdAt: prev?.createdAt ?? next.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
}

function stampSighting(
  prev: SyncSighting | undefined,
  next: SyncSighting,
  now: number,
): SyncSighting {
  if (
    prev &&
    prev.cowId === next.cowId &&
    prev.at === next.at &&
    prev.lat === next.lat &&
    prev.lng === next.lng &&
    prev.accuracy === next.accuracy &&
    (prev.deletedAt == null || prev.deletedAt < prev.updatedAt)
  ) {
    return prev;
  }
  return {
    ...next,
    updatedAt: now,
    deletedAt: null,
  };
}
