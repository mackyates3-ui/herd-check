import type { HerdDocument, HerdStore } from "./store";

export function createMemoryStore(): HerdStore {
  const herds = new Map<string, HerdDocument>();
  let chain: Promise<unknown> = Promise.resolve();

  const lock = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  return {
    async create(code, doc) {
      return lock(async () => {
        if (herds.has(code)) return "taken";
        const saved = { ...doc, version: 1 };
        herds.set(code, saved);
        return clone(saved);
      });
    },
    async load(code) {
      const found = herds.get(code);
      return found ? clone(found) : null;
    },
    async change(code, mutate) {
      return lock(async () => {
        const current = herds.get(code);
        if (!current) return null;
        const next = mutate(clone(current));
        const saved = { ...next, version: current.version + 1 };
        herds.set(code, saved);
        return clone(saved);
      });
    },
  };
}

function clone(doc: HerdDocument): HerdDocument {
  return structuredClone(doc);
}
