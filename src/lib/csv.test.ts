import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Cow, Sighting } from "../types";
import {
  applyHerdImport,
  formatImportSummary,
  herdToCsv,
  parseCsvRecords,
  parseHerdCsv,
} from "./csv";

const ranchCsv = readFileSync(resolve(process.cwd(), "public/herd-active.csv"), "utf8");

const cow = (id: string, tag: string, name = "", notes = ""): Cow => ({
  id,
  tag,
  name,
  notes,
  createdAt: 1,
});

describe("parseCsvRecords", () => {
  it("parses quoted commas and a UTF-8 BOM", () => {
    const records = parseCsvRecords('\uFEFFtag,name,notes\n014,"Bossy, lead","line 1"\n');
    expect(records).toEqual([
      ["tag", "name", "notes"],
      ["014", "Bossy, lead", "line 1"],
    ]);
  });
});

describe("parseHerdCsv", () => {
  it("reads tag, name, and notes", () => {
    const parsed = parseHerdCsv("tag,name,notes\n014,Bossy,Lead cow\n027,,\n");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toEqual([
      { tag: "014", name: "Bossy", notes: "Lead cow" },
      { tag: "027", name: "", notes: "" },
    ]);
    expect(parsed.skipped).toBe(0);
  });

  it("maps CattleMax headers and builds notes from type, sex, EID, status", () => {
    const parsed = parseHerdCsv(
      [
        "ear_tag,name,animal_type,sex,electronic_id,status",
        "140Y UW,,Cow,Heifer,140-368,Active",
        "16,,Cow,Heifer,,Active",
        "NOTCH,NOTCH,Bull,Bull,,Active",
      ].join("\n"),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toEqual([
      { tag: "140Y UW", name: "", notes: "Cow · Heifer · EID 140-368 · Active" },
      { tag: "16", name: "", notes: "Cow · Heifer · Active" },
      { tag: "NOTCH", name: "NOTCH", notes: "Bull · Bull · Active" },
    ]);
  });

  it("skips blank tags and later duplicates, keeping the first row", () => {
    const parsed = parseHerdCsv("tag,name,notes\n014,A,one\n,skip,\n014,B,two\n203,C,three\n");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows.map((row) => row.tag)).toEqual(["014", "203"]);
    expect(parsed.rows[0]).toEqual({ tag: "014", name: "A", notes: "one" });
    expect(parsed.skipped).toBe(2);
  });

  it("dedupes a Herd Check export that repeats a tag per sighting", () => {
    const cows = [cow("a", "014", "Bossy", "lead")];
    const sightings: Sighting[] = [
      { id: "s1", cowId: "a", at: 2, lat: 1, lng: 2, accuracy: 8 },
      { id: "s2", cowId: "a", at: 1, lat: null, lng: null, accuracy: null },
    ];
    const parsed = parseHerdCsv(herdToCsv(cows, sightings));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toEqual([{ tag: "014", name: "Bossy", notes: "lead" }]);
    expect(parsed.skipped).toBe(1);
  });

  it("rejects a file without a tag column", () => {
    const parsed = parseHerdCsv("name,notes\nBossy,lead\n");
    expect(parsed).toEqual({ ok: false, error: "CSV needs a tag or ear_tag column." });
  });
});

describe("applyHerdImport", () => {
  it("replace clears sightings and loads unique tags", () => {
    const existing = [cow("old", "014", "Bossy")];
    const sightings: Sighting[] = [
      { id: "s1", cowId: "old", at: 9, lat: null, lng: null, accuracy: null },
    ];
    const result = applyHerdImport(
      existing,
      sightings,
      [
        { tag: "203B UW", name: "", notes: "Cow · Heifer · Active" },
        { tag: "102Y WU", name: "LUCY", notes: "Cow · Heifer · EID 102-330 · Active" },
      ],
      "replace",
      50,
    );
    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.sightings).toEqual([]);
    expect(result.cows.map((c) => c.tag)).toEqual(["203B UW", "102Y WU"]);
    expect(result.cows[1]?.name).toBe("LUCY");
    expect(result.cows.every((c) => c.id !== "old")).toBe(true);
  });

  it("merge adds new tags, updates filled fields, and keeps sightings", () => {
    const existing = [cow("keep", "014", "Bossy", "old note")];
    const sightings: Sighting[] = [
      { id: "s1", cowId: "keep", at: 9, lat: 31, lng: -100, accuracy: 12 },
    ];
    const result = applyHerdImport(
      existing,
      sightings,
      [
        { tag: "014", name: "", notes: "Cow · Heifer · Active" },
        { tag: "203", name: "Mama", notes: "pair" },
      ],
      "merge",
    );
    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.sightings).toEqual(sightings);
    const bossy = result.cows.find((c) => c.id === "keep");
    expect(bossy).toMatchObject({
      tag: "014",
      name: "Bossy",
      notes: "Cow · Heifer · Active",
    });
    expect(result.cows.some((c) => c.tag === "203" && c.name === "Mama")).toBe(true);
  });
});

describe("formatImportSummary", () => {
  it("describes replace and merge counts", () => {
    expect(
      formatImportSummary({ added: 183, updated: 0, skipped: 0 }, "replace"),
    ).toBe("Loaded 183 animals");
    expect(
      formatImportSummary({ added: 12, updated: 3, skipped: 2 }, "merge"),
    ).toBe("Added 12, updated 3, skipped 2");
  });
});

describe("bundled ranch herd", () => {
  it("parses 183 unique Active tags from public/herd-active.csv", () => {
    const parsed = parseHerdCsv(ranchCsv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toHaveLength(183);
    expect(parsed.skipped).toBe(0);
    expect(new Set(parsed.rows.map((row) => row.tag)).size).toBe(183);
    expect(parsed.rows.some((row) => row.tag === "102Y WU" && row.name === "LUCY")).toBe(true);
    expect(parsed.rows.some((row) => row.tag === "KERMIT" && row.name === "KERMIT")).toBe(true);
    expect(parsed.rows.some((row) => row.tag === "09" && row.name === "W2 Jackhammer J09")).toBe(
      true,
    );
    expect(parsed.rows.every((row) => /Active$/i.test(row.notes))).toBe(true);
    const applied = applyHerdImport([], [], parsed.rows, "replace");
    expect(applied.added).toBe(183);
    expect(applied.sightings).toEqual([]);
  });
});
