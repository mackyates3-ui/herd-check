import { Download, WifiOff } from "lucide-react";
import { Button } from "./ui";

export function InstallBanner({
  show,
  offlineReady,
  online,
  canInstall,
  iosHint,
  onInstall,
  onDismiss,
}: {
  show: boolean;
  offlineReady: boolean;
  online: boolean;
  canInstall: boolean;
  iosHint: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  if (!show) return null;

  return (
    <div className="rounded-2xl bg-card px-4 py-3 shadow-[var(--shadow-border)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {online ? <Download className="size-4" /> : <WifiOff className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {offlineReady ? "Offline ready" : "Works in the pasture"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {iosHint
              ? "On iPhone: Share → Add to Home Screen. After the first load, tallies stay on this phone with no signal."
              : "Install Herd Check so today’s tally is here without a signal. Camera reading also stays on-device."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canInstall ? (
              <Button size="md" onClick={onInstall}>
                Install
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onDismiss}>
              Got it
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatusChip({
  online,
  offlineReady,
}: {
  online: boolean;
  offlineReady: boolean;
}) {
  const label = !online ? "Offline" : offlineReady ? "Offline ready" : "Online";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span
        className={`size-1.5 rounded-full ${
          !online ? "bg-leather" : offlineReady ? "bg-primary" : "bg-muted-foreground"
        }`}
      />
      {label}
    </span>
  );
}
