import { describe, expect, it } from "vitest";
import { countedTodayCount } from "../tags";
import { createShareCode } from "./code";
import { handleSync } from "./http";
import { liveHerd } from "./merge";
import { createMemoryStore } from "./memory-store";
import type { Cow, Sighting } from "../../types";

const NOW = Date.parse("2026-10-06T18:00:00");

function cow(id: string, tag: string): Cow {
  return { id, tag, name: "", notes: "", createdAt: 1, updatedAt: 1 };
}

function see(id: string, cowId: string): Sighting {
  return { id, cowId, at: NOW, lat: null, lng: null, accuracy: null, updatedAt: NOW };
}

describe("sync API", () => {
  it("links two phones, then converges after one counted offline", async () => {
    const store = createMemoryStore();
    const created = await handleSync(
      { action: "create", cows: [cow("a", "101"), cow("b", "102")], sightings: [] },
      store,
      createShareCode,
    );
    expect(created.status).toBe(200);
    if (!created.body.ok) throw new Error(created.body.error);
    const code = created.body.code;

    const joined = await handleSync({ action: "join", code, cows: [], sightings: [] }, store, createShareCode);
    expect(joined.body.ok).toBe(true);
    if (!joined.body.ok) return;

    const phoneA = await handleSync(
      {
        action: "push",
        code,
        cows: joined.body.cows,
        sightings: [see("s-a", "a")],
      },
      store,
      createShareCode,
    );
    const phoneBOffline = {
      cows: joined.body.cows,
      sightings: [see("s-b", "a"), see("s-c", "b")],
    };
    const phoneB = await handleSync(
      { action: "push", code, ...phoneBOffline },
      store,
      createShareCode,
    );
    expect(phoneA.body.ok && phoneB.body.ok).toBe(true);
    if (!phoneA.body.ok || !phoneB.body.ok) return;

    const again = await handleSync(
      { action: "push", code, cows: phoneA.body.cows, sightings: phoneA.body.sightings },
      store,
      createShareCode,
    );
    expect(again.body.ok).toBe(true);
    if (!again.body.ok) return;
    const live = liveHerd(again.body);
    expect(countedTodayCount(live.cows, live.sightings, NOW)).toBe(2);
    expect(live.sightings.filter((item) => item.cowId === "a")).toHaveLength(2);
    expect(live.sightings.filter((item) => item.cowId === "b")).toHaveLength(1);
  });

  it("rejects a short code and an unknown herd", async () => {
    const store = createMemoryStore();
    const bad = await handleSync({ action: "join", code: "nope", cows: [], sightings: [] }, store, createShareCode);
    expect(bad.status).toBe(400);
    const missing = await handleSync(
      { action: "join", code: "ABCD-EFGH-JKMN-PQRS", cows: [], sightings: [] },
      store,
      createShareCode,
    );
    expect(missing.status).toBe(404);
  });
});
