export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function paddedId(prefix: string, n: number): string {
  return `${prefix}-${n.toString().padStart(3, "0")}`;
}
