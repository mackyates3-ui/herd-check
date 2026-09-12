import { useCallback, useState } from "react";
import { createId } from "../lib/ids";
import type { ToastMessage } from "../types";

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const push = useCallback((text: string, tone: ToastMessage["tone"] = "ok") => {
    const id = createId("toast");
    setToasts((prev) => [...prev.slice(-3), { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}
