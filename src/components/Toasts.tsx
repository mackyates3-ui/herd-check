import type { ToastMessage } from "../types";

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-60 flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => onDismiss(toast.id)}
          className={`pointer-events-auto max-w-lg rounded-2xl px-4 py-3 text-sm shadow-[var(--shadow-lift)] ${
            toast.tone === "error"
              ? "bg-destructive text-destructive-foreground"
              : "bg-leather text-primary-foreground"
          }`}
        >
          {toast.text}
        </button>
      ))}
    </div>
  );
}
