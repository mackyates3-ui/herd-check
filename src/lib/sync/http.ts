import { isShareCode, normalizeShareCode } from "./code";
import { asSyncCow, asSyncSighting, mergeHerds, type HerdSnapshot, type SyncCow, type SyncSighting } from "./merge";
import type { HerdDocument, HerdStore } from "./store";
import type { Cow, Sighting } from "../../types";

const MAX_COWS = 5000;
const MAX_SIGHTINGS = 20000;

export type SyncAction = "create" | "join" | "push";

export interface SyncRequestBody {
  action?: SyncAction;
  code?: string;
  cows?: Cow[];
  sightings?: Sighting[];
}

export interface SyncSuccess {
  ok: true;
  code: string;
  version: number;
  cows: SyncCow[];
  sightings: SyncSighting[];
}

export interface SyncFailure {
  ok: false;
  error: "bad_code" | "not_found" | "too_large" | "bad_request";
}

export async function handleSync(
  body: SyncRequestBody,
  store: HerdStore,
  createCode: () => string,
): Promise<{ status: number; body: SyncSuccess | SyncFailure }> {
  const snapshot = sanitizeSnapshot(body.cows, body.sightings);
  if (!snapshot) return { status: 400, body: { ok: false, error: "bad_request" } };
  if (snapshot.cows.length > MAX_COWS || snapshot.sightings.length > MAX_SIGHTINGS) {
    return { status: 413, body: { ok: false, error: "too_large" } };
  }

  if (body.action === "create") {
    const saved = await createHerd(store, snapshot, createCode);
    return { status: 200, body: saved };
  }

  const code = normalizeShareCode(body.code ?? "");
  if (!isShareCode(code)) return { status: 400, body: { ok: false, error: "bad_code" } };

  if (body.action === "join") {
    const current = await store.load(code);
    if (!current) return { status: 404, body: { ok: false, error: "not_found" } };
    return { status: 200, body: documentResponse(code, current) };
  }

  if (body.action === "push") {
    const saved = await store.change(code, (current) => ({
      version: current.version,
      ...mergeHerds(current, snapshot),
    }));
    if (!saved) return { status: 404, body: { ok: false, error: "not_found" } };
    return { status: 200, body: documentResponse(code, saved) };
  }

  return { status: 400, body: { ok: false, error: "bad_request" } };
}

export async function createHerd(
  store: HerdStore,
  snapshot: HerdSnapshot,
  createCode: () => string,
): Promise<SyncSuccess> {
  let code = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    code = normalizeShareCode(createCode());
    const existing = await store.load(code);
    if (existing) continue;
    const saved = await store.create(code, {
      version: 1,
      ...mergeHerds({ cows: [], sightings: [] }, snapshot),
    });
    if (saved === "taken") continue;
    return { ok: true, code, version: saved.version, cows: saved.cows, sightings: saved.sightings };
  }
  throw new Error("Could not create a share code.");
}

function documentResponse(code: string, doc: HerdDocument): SyncSuccess {
  return { ok: true, code, version: doc.version, cows: doc.cows, sightings: doc.sightings };
}

function sanitizeSnapshot(cows: Cow[] | undefined, sightings: Sighting[] | undefined): HerdSnapshot | null {
  if (cows != null && !Array.isArray(cows)) return null;
  if (sightings != null && !Array.isArray(sightings)) return null;
  const cleanCows: SyncCow[] = [];
  for (const cow of cows ?? []) {
    if (!cow || typeof cow.id !== "string" || typeof cow.tag !== "string") return null;
    cleanCows.push(asSyncCow(cow));
  }
  const cleanSightings: SyncSighting[] = [];
  for (const sighting of sightings ?? []) {
    if (!sighting || typeof sighting.id !== "string" || typeof sighting.cowId !== "string") return null;
    cleanSightings.push(asSyncSighting(sighting));
  }
  return { cows: cleanCows, sightings: cleanSightings };
}
