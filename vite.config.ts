import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { createShareCode } from "./src/lib/sync/code";
import { createFileStore } from "./src/lib/sync/file-store";
import { handleSync, type SyncRequestBody } from "./src/lib/sync/http";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 6000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    herdSyncPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "herd-active.csv",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-maskable-512.png",
        "icons/apple-touch-icon.png",
        "fonts/*.woff2",
        "tesseract/*",
        "vosk/*",
      ],
      manifest: {
        name: "Herd Check",
        short_name: "Herd Check",
        description:
          "Daily cattle tally. Say an eartag or tap the cow, then open it for past times and locations.",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F1EBE0",
        theme_color: "#F1EBE0",
        categories: ["utilities", "productivity"],
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/apple-touch-icon.png",
            sizes: "180x180",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,wasm,gz,csv,txt,bin}"],
        maximumFileSizeToCacheInBytes: 60 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/tesseract\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "herd-check-ocr",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/vosk\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "herd-check-voice",
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});

function herdSyncPlugin(): Plugin {
  const store = createFileStore(path.resolve(__dirname, "data/sync-herds.json"));
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url?.split("?")[0];
    if (url !== "/api/sync") {
      next();
      return;
    }
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "bad_request" }));
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      void (async () => {
        try {
          if (Buffer.concat(chunks).length > 2_000_000) {
            res.statusCode = 413;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: false, error: "too_large" }));
            return;
          }
          const text = Buffer.concat(chunks).toString("utf8");
          const body = (text ? JSON.parse(text) : {}) as SyncRequestBody;
          const result = await handleSync(body, store, createShareCode);
          res.statusCode = result.status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result.body));
        } catch {
          res.statusCode = 400;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "bad_request" }));
        }
      })();
    });
  };
  return {
    name: "herd-sync",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
