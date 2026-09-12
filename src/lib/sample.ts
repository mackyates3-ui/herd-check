import type { Cow, Sighting } from "../types";
import { minutesAgo } from "./dates";
import { paddedId } from "./ids";

/** West Texas ranch-ish origin used only for demo pins. */
const ORIGIN = { lat: 31.8942, lng: -100.4821 };

const SAMPLE_COWS: [string, string, string][] = [
  ["014", "Bossy", "Lead cow. Keeps the bunch together."],
  ["027", "", ""],
  ["041", "Red", "Easy to spot on the north fence."],
  ["058", "", ""],
  ["073", "", ""],
  ["088", "Speckle", "White face, hangs near the tank."],
  ["102", "", ""],
  ["119", "", ""],
  ["134", "", ""],
  ["156", "Junior", "Yearling. Follows 203."],
  ["171", "", ""],
  ["188", "", ""],
  ["203", "Mama", "Pair with 156."],
  ["217", "", ""],
];

type SampleSee = [string, number, number, number, number, number?];

const SAMPLE_SIGHTINGS: SampleSee[] = [
  ["014", 1.2, 8, 0.4, 0.2],
  ["014", 26, 12, -0.8, 1.1],
  ["014", 50, 4, 1.6, -0.3],
  ["014", 74, 22, 0.1, 1.8],
  ["027", 0.8, 3, 0.6, 0.1],
  ["027", 25, 40, 2.1, 0.4],
  ["027", 73, 15, -1.2, 0.8],
  ["041", 2.1, 18, -0.3, 1.4],
  ["041", 27, 6, 0.2, 1.9],
  ["041", 49, 33, 1.1, 0.6],
  ["041", 98, 10, -2, -0.4],
  ["058", 25, 50, 0.8, -1.2],
  ["058", 72, 8, 1.4, 0.2],
  ["073", 1.6, 21, 0, 0.5],
  ["073", 26, 2, -0.5, 0.9],
  ["073", 51, 44, 2.4, 1.2],
  ["088", 0.4, 11, 1.8, -0.6],
  ["088", 24, 28, 1.5, -0.8],
  ["088", 47, 9, 0.9, -1.4],
  ["088", 96, 16, 2.2, -0.2],
  ["102", 49, 19, -1.6, 1.5],
  ["102", 75, 7, -0.2, 0.3],
  ["119", 1.9, 5, 0.3, -0.1],
  ["119", 28, 31, 0.7, 0.6],
  ["119", 52, 14, -0.9, 1],
  ["134", 73, 41, 1.2, 2],
  ["134", 99, 3, 0.4, 1.3],
  ["156", 1.1, 16, -0.4, 0.7, 18],
  ["156", 25, 9, -0.6, 0.8],
  ["156", 50, 27, 0.1, 0.4],
  ["171", 26, 18, 2, 0],
  ["171", 74, 36, 1.7, 0.5],
  ["188", 2.4, 2, -1.1, -0.7],
  ["188", 27, 22, -1.4, -0.3],
  ["188", 51, 11, -0.8, 0.2],
  ["203", 1, 7, -0.5, 0.75, 11],
  ["203", 25, 13, -0.55, 0.82],
  ["203", 49, 20, 0, 0.5],
  ["203", 97, 8, 0.6, 1.1],
  ["217", 48, 45, 1.3, -1],
  ["217", 76, 17, 0.5, -0.6],
];

export function createSampleHerd(now = Date.now()): {
  cows: Cow[];
  sightings: Sighting[];
} {
  const createdAt = now - 10_368e6;
  const cows: Cow[] = SAMPLE_COWS.map(([tag, name, notes], index) => ({
    id: paddedId("cow", index + 1),
    tag,
    name,
    notes,
    createdAt,
  }));
  const byTag = Object.fromEntries(cows.map((cow) => [cow.tag, cow.id]));
  const sightings: Sighting[] = SAMPLE_SIGHTINGS.map(
    ([tag, hours, minutes, dx, dy, accuracy = 14]) => ({
      id: `see-${tag}-${hours}-${minutes}`,
      cowId: byTag[tag]!,
      at: minutesAgo(hours, minutes, now),
      lat: ORIGIN.lat + dy * 0.001,
      lng: ORIGIN.lng + dx * 0.001,
      accuracy,
    }),
  );
  return { cows, sightings };
}
