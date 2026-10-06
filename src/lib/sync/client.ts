import { createShareCode } from "./code";
import type { SyncFailure, SyncSuccess } from "./http";
import type { SyncCow, SyncSighting } from "./merge";
import type { Cow, Sighting } from "../../types";

export type SyncClientResult =
  | { ok: true; code: string; cows: SyncCow[]; sightings: SyncSighting[] }
  | { ok: false; error: SyncFailure["error"] | "not_configured" | "unreachable" };

export function syncErrorMessage(error: Exclude<SyncClientResult, { ok: true }>["error"]): string {
  if (error === "not_configured") {
    return "Sharing isn't set up on this server yet. Counts stay on this phone.";
  }
  if (error === "not_found") return "That code doesn't match a shared herd.";
  if (error === "bad_code") return "Enter the full code from the other phone.";
  if (error === "too_large") return "This herd is too big to share.";
  return "Can't reach the shared herd right now. Counts stay on this phone.";
}

export async function createSharedHerd(cows: Cow[], sightings: Sighting[]): Promise<SyncClientResult> {
  return postSync({ action: "create", cows, sightings });
}

export async function joinSharedHerd(code: string): Promise<SyncClientResult> {
  return postSync({ action: "join", code, cows: [], sightings: [] });
}

export async function pushSharedHerd(
  code: string,
  cows: Cow[],
  sightings: Sighting[],
): Promise<SyncClientResult> {
  return postSync({ action: "push", code, cows, sightings });
}

async function postSync(body: {
  action: "create" | "join" | "push";
  code?: string;
  cows: Cow[];
  sightings: Sighting[];
}): Promise<SyncClientResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, error: "unreachable" };
  }
  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status === 503) return { ok: false, error: "not_configured" };
    const payload = (await response.json()) as SyncSuccess | SyncFailure | { error?: string };
    if (!response.ok || !("ok" in payload) || payload.ok !== true) {
      const error = "error" in payload ? payload.error : "bad_request";
      if (
        error === "bad_code" ||
        error === "not_found" ||
        error === "too_large" ||
        error === "bad_request" ||
        error === "not_configured"
      ) {
        return { ok: false, error };
      }
      return { ok: false, error: "unreachable" };
    }
    return { ok: true, code: payload.code, cows: payload.cows, sightings: payload.sightings };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

export { createShareCode };
