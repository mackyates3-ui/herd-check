import { Copy, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useHerd } from "../hooks/useHerd";
import { useOnline } from "../hooks/useOnline";
import { formatShareCode } from "../lib/sync/code";
import { syncErrorMessage } from "../lib/sync/client";
import { syncStatusText } from "../lib/sync/status";
import { Button, TextInput } from "./ui";

export function SyncSheet({
  open,
  prefill,
  onClose,
}: {
  open: boolean;
  prefill: string;
  onClose: () => void;
}) {
  const herd = useHerd();
  const online = useOnline();
  const [codeDraft, setCodeDraft] = useState(prefill);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (prefill) setCodeDraft(prefill);
  }, [prefill]);

  useEffect(() => {
    if (!open || !herd.syncCode) {
      setQr("");
      return;
    }
    const link = `${window.location.origin}/?join=${herd.syncCode}`;
    let cancelled = false;
    void import("qrcode").then(async (mod) => {
      const url = await mod.toDataURL(link, { margin: 1, width: 220 });
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [herd.syncCode, open]);

  if (!open) return null;

  const status = syncStatusText({
    linked: Boolean(herd.syncCode),
    online,
    pending: herd.syncPending,
    lastSyncedAt: herd.lastSyncedAt,
    error: herd.syncError,
  });

  const share = async () => {
    setBusy(true);
    setNotice("");
    const result = await herd.shareHerd();
    setBusy(false);
    if (!result.ok) setNotice(syncErrorMessage(result.error));
  };

  const join = async () => {
    setBusy(true);
    setNotice("");
    const result = await herd.joinHerd(codeDraft);
    setBusy(false);
    if (!result.ok) {
      setNotice(syncErrorMessage(result.error));
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("join");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close share sheet" className="absolute inset-0 bg-leather/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share tally"
        className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background px-5 pt-5 pb-6 shadow-[var(--shadow-lift)] sm:rounded-3xl"
      >
        <h2 className="font-display text-xl">Share tally</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Phones keep counting with no signal. When one has service, it sends its checks and picks up the others. A cow counted on two phones still counts once today.
        </p>

        {herd.syncCode ? (
          <div className="mt-4">
            <p className="text-sm text-muted-foreground">{status}</p>
            {herd.syncError && online ? <p className="mt-1 text-sm text-destructive">{herd.syncError}</p> : null}
            <p className="font-tag mt-3 text-center text-2xl tracking-wide">{formatShareCode(herd.syncCode)}</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  void navigator.clipboard?.writeText(formatShareCode(herd.syncCode ?? ""));
                  setNotice("Code copied.");
                }}
              >
                <Copy className="size-4" />
                Copy code
              </Button>
              <Button variant="leather" className="flex-1" disabled={busy || !online} onClick={() => void herd.syncNow()}>
                <RefreshCw className="size-4" />
                Sync now
              </Button>
            </div>
            {qr ? (
              <img
                src={qr}
                alt="QR code that joins this shared tally"
                className="mx-auto mt-4 size-52 rounded-2xl bg-white p-2"
              />
            ) : null}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              The other phone scans this or types the code. Anyone with the code can see this herd.
            </p>
            <Button variant="ghost" className="mt-3 w-full" onClick={herd.stopSharing}>
              Stop sharing on this phone
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <Button size="lg" className="w-full" disabled={busy} onClick={() => void share()}>
              Create a share code
            </Button>
            <p className="text-center text-xs text-muted-foreground">or join a code from the other phone</p>
            <TextInput
              value={codeDraft}
              onChange={(event) => setCodeDraft(event.target.value)}
              aria-label="Share code"
              autoCapitalize="characters"
              autoCorrect="off"
              placeholder="ABCD-EFGH-JKMN-PQRS"
              className="font-tag tracking-wide"
            />
            <Button size="lg" variant="leather" className="w-full" disabled={busy || !codeDraft.trim()} onClick={() => void join()}>
              Join herd
            </Button>
            <p className="text-xs text-muted-foreground">
              Animals already on this phone are added into the shared herd. Clear the sample list first if you don't want those included.
            </p>
          </div>
        )}
        {notice ? <p className="mt-3 text-sm text-muted-foreground">{notice}</p> : null}
        <Button variant="outline" className="mt-4 w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
