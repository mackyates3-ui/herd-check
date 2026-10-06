import { describe, expect, it } from "vitest";
import { countedTodayCount } from "../tags";
import { isShareCode, normalizeShareCode } from "./code";
import { applyLocalSnapshot } from "./local";
import {
  cowIsLive,
  liveHerd,
  mergeHerds,
  sightingIsLive,
  type SyncCow,
  type SyncSighting,
} from "./merge";

const NOW = Date.parse("2026-10-06T15:00:00");

function cow(partial: Partial<SyncCow> & Pick<SyncCow, "id" | "tag">): SyncCow {
  return {
    name: "",
    notes: "",
    createdAt: partial.createdAt ?? 1,
    updatedAt: partial.updatedAt ?? partial.createdAt ?? 1,
    deletedAt: partial.deletedAt ?? null,
    ...partial,
  };
}

function see(
  partial: Partial<SyncSighting> & Pick<SyncSighting, "id" | "cowId">,
): SyncSighting {
  const at = partial.at ?? NOW;
  return {
    at,
    lat: null,
    lng: null,
    accuracy: null,
    updatedAt: partial.updatedAt ?? at,
    deletedAt: null,
    ...partial,
  };
}

function tally(snapshot: ReturnType<typeof mergeHerds>, now = NOW): string[] {
  const live = liveHerd(snapshot);
  return live.cows
    .filter((animal) => countedTodayCount([animal], live.sightings, now) === 1)
    .map((animal) => animal.tag)
    .sort();
}

describe("mergeHerds", () => {
  it("keeps both phones' counts without counting one cow twice", () => {
    const base = {
      cows: [cow({ id: "a", tag: "101" }), cow({ id: "b", tag: "102" })],
      sightings: [],
    };
    const phoneA = mergeHerds(base, {
      cows: base.cows,
      sightings: [see({ id: "s-a", cowId: "a" })],
    });
    const phoneB = mergeHerds(base, {
      cows: base.cows,
      sightings: [see({ id: "s-b", cowId: "a" }), see({ id: "s-c", cowId: "b" })],
    });
    const merged = mergeHerds(phoneA, phoneB);
    expect(tally(merged)).toEqual(["101", "102"]);
    const live = liveHerd(merged);
    expect(live.sightings.filter((item) => item.cowId === "a")).toHaveLength(2);
    expect(countedTodayCount(live.cows, live.sightings, NOW)).toBe(2);
  });

  it("is commutative and idempotent", () => {
    const left = {
      cows: [cow({ id: "a", tag: "101", name: "Ann", updatedAt: 10 })],
      sightings: [see({ id: "s1", cowId: "a", at: NOW })],
    };
    const right = {
      cows: [cow({ id: "a", tag: "101", name: "Annie", updatedAt: 20 })],
      sightings: [see({ id: "s2", cowId: "a", at: NOW + 1000 })],
    };
    const ab = mergeHerds(left, right);
    const ba = mergeHerds(right, left);
    expect(ab).toEqual(ba);
    expect(mergeHerds(ab, ba)).toEqual(ab);
    expect(liveHerd(ab).cows[0]?.name).toBe("Annie");
  });

  it("lets a later edit beat an earlier removal, and an earlier edit lose", () => {
    const removed = cow({ id: "a", tag: "101", name: "Old", updatedAt: 50, deletedAt: 50 });
    const earlierEdit = cow({ id: "a", tag: "101", name: "Earlier", updatedAt: 40 });
    const laterEdit = cow({ id: "a", tag: "101", name: "Later", updatedAt: 60 });
    expect(cowIsLive(mergeHerds({ cows: [removed], sightings: [] }, { cows: [earlierEdit], sightings: [] }).cows[0]!)).toBe(false);
    const revived = mergeHerds({ cows: [removed], sightings: [] }, { cows: [laterEdit], sightings: [] });
    expect(liveHerd(revived).cows.map((item) => item.name)).toEqual(["Later"]);
  });

  it("undo removes one phone's sighting and leaves the other phone's count", () => {
    const cows = [cow({ id: "a", tag: "23 X" })];
    const kept = see({ id: "s-keep", cowId: "a" });
    const undone = see({ id: "s-undo", cowId: "a", deletedAt: NOW + 5, updatedAt: NOW + 5 });
    const merged = mergeHerds(
      { cows, sightings: [kept, see({ id: "s-undo", cowId: "a" })] },
      { cows, sightings: [undone] },
    );
    expect(tally(merged)).toEqual(["23 X"]);
    expect(liveHerd(merged).sightings.map((item) => item.id)).toEqual(["s-keep"]);
    expect(sightingIsLive(merged.sightings.find((item) => item.id === "s-undo")!)).toBe(false);
  });

  it("folds the same tag added on two phones into one animal and keeps both sightings", () => {
    const merged = mergeHerds(
      {
        cows: [cow({ id: "a", tag: "102Y WU", name: "", createdAt: 10, updatedAt: 10 })],
        sightings: [see({ id: "s-a", cowId: "a" })],
      },
      {
        cows: [cow({ id: "b", tag: "102Y WU", name: "Lucy", createdAt: 20, updatedAt: 30 })],
        sightings: [see({ id: "s-b", cowId: "b" })],
      },
    );
    const live = liveHerd(merged);
    expect(live.cows).toHaveLength(1);
    expect(live.cows[0]).toMatchObject({ id: "a", name: "Lucy", tag: "102Y WU" });
    expect(live.sightings.map((item) => item.cowId).sort()).toEqual(["a", "a"]);
    expect(tally(merged)).toEqual(["102Y WU"]);
  });

  it("brings back a removed animal when another phone counts it later", () => {
    const removed = cow({ id: "a", tag: "205", updatedAt: 100, deletedAt: 100 });
    const merged = mergeHerds(
      { cows: [removed], sightings: [] },
      {
        cows: [cow({ id: "a", tag: "205", updatedAt: 100, deletedAt: 100 })],
        sightings: [see({ id: "s-later", cowId: "a", at: NOW, updatedAt: NOW })],
      },
    );
    expect(tally(merged)).toEqual(["205"]);
  });

  it("propagates a CSV replace without erasing a newer animal from the other phone", () => {
    const original = [cow({ id: "old", tag: "014", name: "Bossy", createdAt: 1, updatedAt: 1 })];
    const sighting = see({ id: "s-old", cowId: "old", at: 50, updatedAt: 50 });
    const replaced = applyLocalSnapshot(
      original,
      [sighting],
      [cow({ id: "new", tag: "203", createdAt: 80, updatedAt: 80 })],
      [],
      80,
    );
    const otherPhone = {
      cows: [cow({ id: "fresh", tag: "999", createdAt: 120, updatedAt: 120 })],
      sightings: [see({ id: "s-fresh", cowId: "fresh", at: 130, updatedAt: 130 })],
    };
    const merged = mergeHerds(replaced, otherPhone);
    const live = liveHerd(merged);
    expect(live.cows.map((item) => item.tag).sort()).toEqual(["203", "999"]);
    expect(live.sightings.map((item) => item.id)).toEqual(["s-fresh"]);
    expect(cowIsLive(merged.cows.find((item) => item.id === "old")!)).toBe(false);
  });

  it("does not let an older import overwrite a newer name", () => {
    const renamed = cow({ id: "a", tag: "101", name: "New", updatedAt: 50 });
    const imported = applyLocalSnapshot(
      [cow({ id: "a", tag: "101", name: "Old", updatedAt: 10 })],
      [],
      [cow({ id: "a", tag: "101", name: "Old", updatedAt: 10 })],
      [],
      20,
    );
    const merged = mergeHerds(imported, { cows: [renamed], sightings: [] });
    expect(liveHerd(merged).cows[0]?.name).toBe("New");
  });
});

describe("share codes", () => {
  it("accepts a grouped code and rejects a short one", () => {
    expect(normalizeShareCode("ab cd-efgh-jkmn-pqrs")).toBe("ABCDEFGHJKMNPQRS");
    expect(isShareCode("ABCD-EFGH-JKMN-PQRS")).toBe(true);
    expect(isShareCode("ABCD")).toBe(false);
    expect(isShareCode("ABCD-EFGH-JKMN-PQR0")).toBe(false);
  });
});
