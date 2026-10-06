import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { HerdDocument, HerdStore } from "./store";

/** One JSON file for local preview. Production uses Redis instead. */
export function createFileStore(filePath: string): HerdStore {
  const herds = new Map<string, HerdDocument>();
  let ready = false;
  let chain: Promise<unknown> = Promise.resolve();

  const lock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const hydrate = () => {
    if (ready) return;
    ready = true;
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, HerdDocument>;
      for (const [code, doc] of Object.entries(parsed)) {
        if (!doc || !Array.isArray(doc.cows) || !Array.isArray(doc.sightings)) continue;
        herds.set(code, doc);
      }
    } catch {
      /* missing file means an empty store */
    }
  };

  const persist = () => {
    mkdirSync(dirname(filePath), { recursive: true });
    const payload: Record<string, HerdDocument> = {};
    for (const [code, doc] of herds) payload[code] = doc;
    writeFileSync(filePath, JSON.stringify(payload));
  };

  return {
    create(code, doc) {
      return lock(async () => {
        hydrate();
        if (herds.has(code)) return "taken";
        const saved = { ...doc, version: 1 };
        herds.set(code, saved);
        persist();
        return structuredClone(saved);
      });
    },
    load(code) {
      return lock(async () => {
        hydrate();
        const found = herds.get(code);
        return found ? structuredClone(found) : null;
      });
    },
    change(code, mutate) {
      return lock(async () => {
        hydrate();
        const current = herds.get(code);
        if (!current) return null;
        const next = mutate(structuredClone(current));
        const saved = { ...next, version: current.version + 1 };
        herds.set(code, saved);
        persist();
        return structuredClone(saved);
      });
    },
  };
}
