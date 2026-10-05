import type { Cow, Sighting } from "../types";
import { createId } from "./ids";
import { normalizeTag } from "./tags";

export const RANCH_HERD_URL = "/herd-active.csv";

export type ImportMode = "replace" | "merge";

export interface ImportCowRow {
  tag: string;
  name: string;
  notes: string;
}

export interface ParseHerdCsvResult {
  ok: true;
  rows: ImportCowRow[];
  skipped: number;
}

export interface ParseHerdCsvError {
  ok: false;
  error: string;
}

export interface AppliedImport {
  cows: Cow[];
  sightings: Sighting[];
  added: number;
  updated: number;
  skipped: number;
}

const TAG_HEADERS = new Set(["tag", "ear_tag", "eartag"]);
const NAME_HEADERS = new Set(["name"]);
const NOTES_HEADERS = new Set(["notes", "note", "comments", "comment"]);
const TYPE_HEADERS = new Set(["animal_type", "animaltype", "type"]);
const SEX_HEADERS = new Set(["sex"]);
const EID_HEADERS = new Set(["electronic_id", "electronicid", "eid", "eid_tag"]);
const STATUS_HEADERS = new Set(["status"]);

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function canonHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function cellAt(record: string[], index: number | undefined): string {
  if (index == null) return "";
  return (record[index] ?? "").trim();
}

function formatEid(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  return /^eid\b/i.test(value) ? value : `EID ${value}`;
}

function joinNotes(parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" · ");
}

function displayTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** RFC-style CSV records. Strips a UTF-8 BOM and keeps quoted commas/newlines. */
export function parseCsvRecords(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  const pushRow = () => {
    if (row.length === 0 && field === "") return;
    row.push(field);
    field = "";
    if (rows.length === 0 || row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
    row = [];
  };

  while (i < src.length) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  if (inQuotes || field !== "" || row.length > 0) {
    pushRow();
  }
  return rows;
}

function headerIndex(headers: string[], aliases: Set<string>): number | undefined {
  const index = headers.findIndex((header) => aliases.has(header));
  return index >= 0 ? index : undefined;
}

export function parseHerdCsv(text: string): ParseHerdCsvResult | ParseHerdCsvError {
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return { ok: false, error: "CSV is empty." };
  }

  const headers = (records[0] ?? []).map(canonHeader);
  const tagIndex = headerIndex(headers, TAG_HEADERS);
  if (tagIndex == null) {
    return { ok: false, error: "CSV needs a tag or ear_tag column." };
  }

  const nameIndex = headerIndex(headers, NAME_HEADERS);
  const notesIndex = headerIndex(headers, NOTES_HEADERS);
  const typeIndex = headerIndex(headers, TYPE_HEADERS);
  const sexIndex = headerIndex(headers, SEX_HEADERS);
  const eidIndex = headerIndex(headers, EID_HEADERS);
  const statusIndex = headerIndex(headers, STATUS_HEADERS);

  const rows: ImportCowRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const record of records.slice(1)) {
    const tag = displayTag(cellAt(record, tagIndex));
    if (!tag) {
      skipped += 1;
      continue;
    }
    const key = normalizeTag(tag);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);

    const explicitNotes = cellAt(record, notesIndex);
    const notes =
      explicitNotes ||
      joinNotes([
        cellAt(record, typeIndex),
        cellAt(record, sexIndex),
        formatEid(cellAt(record, eidIndex)),
        cellAt(record, statusIndex),
      ]);

    rows.push({
      tag,
      name: cellAt(record, nameIndex),
      notes,
    });
  }

  return { ok: true, rows, skipped };
}

export function applyHerdImport(
  existingCows: Cow[],
  existingSightings: Sighting[],
  rows: ImportCowRow[],
  mode: ImportMode,
  now = Date.now(),
): AppliedImport {
  if (mode === "replace") {
    const cows = rows.map((row) => ({
      id: createId("cow"),
      tag: row.tag,
      name: row.name,
      notes: row.notes,
      createdAt: now,
    }));
    return {
      cows,
      sightings: [],
      added: cows.length,
      updated: 0,
      skipped: 0,
    };
  }

  const cows = existingCows.map((cow) => ({ ...cow }));
  const byTag = new Map(cows.map((cow) => [normalizeTag(cow.tag), cow]));
  let added = 0;
  let updated = 0;

  for (const row of rows) {
    const current = byTag.get(normalizeTag(row.tag));
    if (!current) {
      const cow: Cow = {
        id: createId("cow"),
        tag: row.tag,
        name: row.name,
        notes: row.notes,
        createdAt: now,
      };
      cows.push(cow);
      byTag.set(normalizeTag(row.tag), cow);
      added += 1;
      continue;
    }
    const nextName = row.name || current.name;
    const nextNotes = row.notes || current.notes;
    if (nextName === current.name && nextNotes === current.notes && current.tag === row.tag) {
      continue;
    }
    current.tag = row.tag;
    current.name = nextName;
    current.notes = nextNotes;
    updated += 1;
  }

  const cowIds = new Set(cows.map((cow) => cow.id));
  return {
    cows,
    sightings: existingSightings.filter((sighting) => cowIds.has(sighting.cowId)),
    added,
    updated,
    skipped: 0,
  };
}

export function formatImportSummary(
  result: Pick<AppliedImport, "added" | "updated" | "skipped">,
  mode: ImportMode,
): string {
  const skipped = result.skipped;
  if (mode === "replace") {
    const base = `Loaded ${result.added} animal${result.added === 1 ? "" : "s"}`;
    return skipped ? `${base}, skipped ${skipped}` : base;
  }
  const parts: string[] = [];
  parts.push(`Added ${result.added}`);
  if (result.updated) parts.push(`updated ${result.updated}`);
  if (skipped) parts.push(`skipped ${skipped}`);
  return parts.join(", ");
}

export function herdToCsv(cows: Cow[], sightings: Sighting[]): string {
  const header = [
    "tag",
    "name",
    "notes",
    "sighting_at",
    "latitude",
    "longitude",
    "accuracy_m",
  ];
  const lines = [header.join(",")];
  const byCow = new Map<string, Sighting[]>();
  for (const s of sightings) {
    const list = byCow.get(s.cowId) ?? [];
    list.push(s);
    byCow.set(s.cowId, list);
  }

  for (const cow of [...cows].sort((a, b) => a.tag.localeCompare(b.tag))) {
    const rows = (byCow.get(cow.id) ?? []).sort((a, b) => b.at - a.at);
    if (rows.length === 0) {
      lines.push([csvCell(cow.tag), csvCell(cow.name), csvCell(cow.notes), "", "", "", ""].join(","));
      continue;
    }
    for (const s of rows) {
      lines.push(
        [
          csvCell(cow.tag),
          csvCell(cow.name),
          csvCell(cow.notes),
          csvCell(new Date(s.at).toISOString()),
          csvCell(s.lat),
          csvCell(s.lng),
          csvCell(s.accuracy),
        ].join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
