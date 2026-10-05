import { useRef, useState } from "react";
import { formatImportSummary, type ImportMode } from "../lib/csv";
import { Button, Sheet } from "./ui";

const MODES: { id: ImportMode; label: string; hint: string }[] = [
  {
    id: "replace",
    label: "Replace herd",
    hint: "Clear cows and sightings, then load this file.",
  },
  {
    id: "merge",
    label: "Merge",
    hint: "Add new tags. Existing tags keep sightings; name and notes update when the file has values.",
  },
];

export function ImportCsvSheet({
  open,
  busy,
  onClose,
  onImport,
}: {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onImport: (text: string, mode: ImportMode) => { added: number; updated: number; skipped: number };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>("replace");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");

  const close = () => {
    setError("");
    setSummary("");
    onClose();
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setSummary("");
    try {
      const text = await file.text();
      const result = onImport(text, mode);
      setSummary(formatImportSummary(result, mode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that CSV.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Sheet open={open} title="Import CSV" onClose={close}>
      <div className="px-5 pt-5 pb-6">
        <h2 className="font-display text-xl">Import CSV</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Needs a <span className="font-medium text-foreground">tag</span> or{" "}
          <span className="font-medium text-foreground">ear_tag</span> column. Name and notes are
          optional. CattleMax exports can use animal type, sex, electronic ID, and status.
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="mb-1.5 text-sm font-medium">Import mode</legend>
          {MODES.map((item) => (
            <label
              key={item.id}
              className={`flex cursor-pointer gap-3 rounded-2xl border px-3 py-3 ${
                mode === item.id ? "border-leather bg-card" : "border-border bg-card/60"
              }`}
            >
              <input
                type="radio"
                name="import-mode"
                className="mt-1"
                checked={mode === item.id}
                onChange={() => setMode(item.id)}
              />
              <span>
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
          }}
        />

        <Button
          size="lg"
          className="mt-5 w-full"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Choose CSV file
        </Button>
        <Button variant="ghost" className="mt-2 w-full" onClick={close}>
          Cancel
        </Button>

        {summary ? (
          <p className="mt-4 rounded-2xl bg-primary/10 px-3 py-2 text-sm">{summary}</p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
