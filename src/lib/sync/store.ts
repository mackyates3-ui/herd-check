import type { HerdSnapshot } from "./merge";

export interface HerdDocument extends HerdSnapshot {
  version: number;
}

export interface HerdStore {
  /** Store a new herd. Returns "taken" if that code already exists. */
  create(code: string, doc: HerdDocument): Promise<HerdDocument | "taken">;
  load(code: string): Promise<HerdDocument | null>;
  /**
   * Read-modify-write. `mutate` may run more than once if two phones sync at
   * the same time. Return the next document without changing `version`;
   * the store assigns the next version.
   */
  change(
    code: string,
    mutate: (current: HerdDocument) => HerdDocument,
  ): Promise<HerdDocument | null>;
}
