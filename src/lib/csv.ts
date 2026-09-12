import type { Cow, Sighting } from "../types";

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
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
