export type HerdFilter = "all" | "missing" | "counted";

export interface Cow {
  id: string;
  tag: string;
  name: string;
  notes: string;
  createdAt: number;
  /** When this phone last changed the tag, name, or notes. */
  updatedAt?: number;
  /** Set when the animal was removed. A later edit clears the removal. */
  deletedAt?: number | null;
}

export interface Sighting {
  id: string;
  cowId: string;
  at: number;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  updatedAt?: number;
  deletedAt?: number | null;
}

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number | null;
}

export interface CowDraft {
  tag: string;
  name?: string;
  notes?: string;
}

export interface ToastMessage {
  id: string;
  text: string;
  tone?: "ok" | "warn" | "error";
}
