import { formatTime } from "../dates";

export function syncStatusText(input: {
  linked: boolean;
  online: boolean;
  pending: number;
  lastSyncedAt: number | null;
  error: string | null;
}): string | null {
  if (!input.linked) return null;
  if (!input.online) {
    return input.pending > 0 ? `Offline · ${input.pending} to send` : "Offline · saved on this phone";
  }
  if (input.pending > 0) return `${input.pending} to send`;
  if (input.error) return "Couldn't sync";
  if (input.lastSyncedAt != null) return `Synced ${formatTime(input.lastSyncedAt)}`;
  return "Shared";
}
