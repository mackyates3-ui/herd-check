import { describe, expect, it } from "vitest";
import type { Cow, Sighting } from "../types";
import {
  applyOcrDigitHints,
  cowCountedToday,
  filterHerd,
  findCowByTag,
  isDuplicateTag,
  parseTagCandidate,
} from "./tags";

const cows: Cow[] = [
  { id: "a", tag: "014", name: "Bossy", notes: "lead", createdAt: 1 },
  { id: "b", tag: "203", name: "Mama", notes: "", createdAt: 1 },
];

const today = Date.UTC(2026, 8, 12, 18, 0, 0);

describe("parseTagCandidate", () => {
  it("keeps a clean digit run", () => {
    expect(parseTagCandidate("014")).toBe("014");
    expect(parseTagCandidate("tag 203 here")).toBe("203");
  });

  it("strips noise and prefers longer digit groups", () => {
    expect(parseTagCandidate("EARTAG\n#088*")).toBe("088");
    expect(parseTagCandidate("12 0145")).toBe("0145");
  });

  it("recovers common OCR letter/digit swaps", () => {
    expect(parseTagCandidate("O14")).toBe("014");
    expect(applyOcrDigitHints("B8S")).toBe("885");
  });
});

describe("herd helpers", () => {
  it("blocks duplicate tags case-insensitively", () => {
    expect(isDuplicateTag(cows, "014")).toBe(true);
    expect(isDuplicateTag(cows, "14")).toBe(false);
    expect(isDuplicateTag(cows, "014", "a")).toBe(false);
    expect(findCowByTag(cows, "014")?.id).toBe("a");
  });

  it("filters counted vs missing for today", () => {
    const sightings: Sighting[] = [
      { id: "s1", cowId: "a", at: today, lat: null, lng: null, accuracy: null },
    ];
    expect(cowCountedToday(sightings, "a", today)).toBe(true);
    expect(filterHerd(cows, sightings, "counted", "", today).map((c) => c.tag)).toEqual([
      "014",
    ]);
    expect(filterHerd(cows, sightings, "missing", "", today).map((c) => c.tag)).toEqual([
      "203",
    ]);
    expect(filterHerd(cows, sightings, "all", "bos", today).map((c) => c.tag)).toEqual([
      "014",
    ]);
  });
});
