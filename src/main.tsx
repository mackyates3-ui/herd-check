import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { warmupOcr } from "./lib/ocr";
import "./index.css";

function Root() {
  const [offlineReady, setOfflineReady] = useState(false);

  const markReady = useCallback(() => setOfflineReady(true), []);

  useEffect(() => {
    registerSW({
      immediate: true,
      onRegisteredSW() {
        markReady();
      },
      onOfflineReady() {
        markReady();
      },
    });
    const idle = window.setTimeout(() => warmupOcr(), 2500);
    return () => {
      window.clearTimeout(idle);
    };
  }, [markReady]);

  return (
    <App offlineReady={offlineReady} onOfflineReady={markReady} />
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
