import { deleteDB, openDB, type IDBPDatabase } from "idb";
import type { Cow, Sighting } from "../types";

const DB_NAME = "herd-check";
const DB_VERSION = 1;

interface HerdDB {
  cows: {
    key: string;
    value: Cow;
    indexes: { "by-tag": string };
  };
  sightings: {
    key: string;
    value: Sighting;
    indexes: { "by-cow": string; "by-at": number };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

export type HerdDatabase = IDBPDatabase<HerdDB>;

export async function openHerdDb(): Promise<HerdDatabase> {
  return openDB<HerdDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("cows")) {
        const cows = db.createObjectStore("cows", { keyPath: "id" });
        cows.createIndex("by-tag", "tag", { unique: false });
      }
      if (!db.objectStoreNames.contains("sightings")) {
        const sightings = db.createObjectStore("sightings", { keyPath: "id" });
        sightings.createIndex("by-cow", "cowId");
        sightings.createIndex("by-at", "at");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    },
  });
}

export async function loadState(db: HerdDatabase): Promise<{
  cows: Cow[];
  sightings: Sighting[];
  seeded: boolean;
}> {
  const [cows, sightings, seeded] = await Promise.all([
    db.getAll("cows"),
    db.getAll("sightings"),
    db.get("meta", "seeded"),
  ]);
  return {
    cows,
    sightings,
    seeded: Boolean(seeded?.value),
  };
}

export async function replaceHerd(
  db: HerdDatabase,
  cows: Cow[],
  sightings: Sighting[],
): Promise<void> {
  const tx = db.transaction(["cows", "sightings", "meta"], "readwrite");
  await tx.objectStore("cows").clear();
  await tx.objectStore("sightings").clear();
  for (const cow of cows) await tx.objectStore("cows").put(cow);
  for (const sighting of sightings) await tx.objectStore("sightings").put(sighting);
  await tx.objectStore("meta").put({ key: "seeded", value: true });
  await tx.done;
}

export async function putCow(db: HerdDatabase, cow: Cow): Promise<void> {
  await db.put("cows", cow);
}

export async function deleteCow(db: HerdDatabase, cowId: string): Promise<void> {
  const keys = await db.getAllKeysFromIndex("sightings", "by-cow", cowId);
  const tx = db.transaction(["cows", "sightings"], "readwrite");
  await tx.objectStore("cows").delete(cowId);
  await Promise.all(keys.map((key) => tx.objectStore("sightings").delete(key)));
  await tx.done;
}

export async function putSighting(db: HerdDatabase, sighting: Sighting): Promise<void> {
  await db.put("sightings", sighting);
}

export async function deleteSighting(db: HerdDatabase, id: string): Promise<void> {
  await db.delete("sightings", id);
}

export async function resetDatabase(): Promise<void> {
  await deleteDB(DB_NAME);
}
