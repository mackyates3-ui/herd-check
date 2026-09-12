import type { Cow, HerdFilter, Sighting } from "../types";
import { isToday } from "./dates";

const OCR_CONFUSIONS: Record<string, string> = {
  O: "0",
  Q: "0",
  D: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  G: "6",
  B: "8",
};

export function normalizeTag(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function tagsMatch(a: string, b: string): boolean {
  return normalizeTag(a) === normalizeTag(b);
}

export function compareTags(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function findCowByTag(cows: Cow[], tag: string): Cow | undefined {
  const needle = normalizeTag(tag);
  return cows.find((cow) => normalizeTag(cow.tag) === needle);
}

export function isDuplicateTag(cows: Cow[], tag: string, exceptId?: string): boolean {
  const needle = normalizeTag(tag);
  return cows.some(
    (cow) => cow.id !== exceptId && normalizeTag(cow.tag) === needle,
  );
}

export function cowCountedToday(
  sightings: Sighting[],
  cowId: string,
  now = Date.now(),
): boolean {
  return sightings.some((s) => s.cowId === cowId && isToday(s.at, now));
}

export function lastSighting(
  sightings: Sighting[],
  cowId: string,
): Sighting | undefined {
  return sightings
    .filter((s) => s.cowId === cowId)
    .sort((a, b) => b.at - a.at)[0];
}

export function countedTodayCount(cows: Cow[], sightings: Sighting[], now = Date.now()): number {
  return cows.filter((cow) => cowCountedToday(sightings, cow.id, now)).length;
}

export function matchesQuery(cow: Cow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    cow.tag.toLowerCase().includes(q) ||
    cow.name.toLowerCase().includes(q) ||
    cow.notes.toLowerCase().includes(q)
  );
}

export function filterHerd(
  cows: Cow[],
  sightings: Sighting[],
  filter: HerdFilter,
  query: string,
  now = Date.now(),
): Cow[] {
  return cows
    .filter((cow) => {
      if (!matchesQuery(cow, query)) return false;
      const counted = cowCountedToday(sightings, cow.id, now);
      if (filter === "counted") return counted;
      if (filter === "missing") return !counted;
      return true;
    })
    .sort((a, b) => {
      const aSeen = cowCountedToday(sightings, a.id, now);
      const bSeen = cowCountedToday(sightings, b.id, now);
      if (aSeen === bSeen) return compareTags(a.tag, b.tag);
      return aSeen ? 1 : -1;
    });
}

/** Pull a likely eartag from noisy OCR text. */
export function parseTagCandidate(raw: string): string {
  const upper = raw.toUpperCase();
  if (!upper.trim()) return "";

  const hinted = [...upper]
    .map((ch) => (OCR_CONFUSIONS[ch] ? OCR_CONFUSIONS[ch] : ch))
    .join("");

  const pickRun = (text: string): string => {
    const runs = [...text.matchAll(/\d{2,6}/g)].map((m) => m[0]);
    if (runs.length === 0) return "";
    return [...runs].sort((a, b) => b.length - a.length || b.localeCompare(a))[0] ?? "";
  };

  return pickRun(hinted) || pickRun(upper) || upper.replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function applyOcrDigitHints(raw: string): string {
  return [...raw.toUpperCase()]
    .map((ch) => OCR_CONFUSIONS[ch] ?? ch)
    .join("")
    .replace(/[^A-Z0-9]/g, "");
}
