import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(root, "public", "tesseract");
mkdirSync(destDir, { recursive: true });
writeFileSync(join(destDir, ".gitkeep"), "");

const copies = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  [
    "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js",
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
    "tesseract-core-lstm.wasm.js",
  ],
];

for (const [from, to] of copies) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.warn(`[ocr-assets] skip missing ${from}`);
    continue;
  }
  copyFileSync(src, join(destDir, to));
  console.log(`[ocr-assets] copied ${to}`);
}

const trainedData = join(destDir, "eng.traineddata.gz");
if (!existsSync(trainedData)) {
  const url =
    "https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best_int/eng.traineddata.gz";
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(trainedData, buf);
    console.log(`[ocr-assets] downloaded eng.traineddata.gz (${buf.length} bytes)`);
  } catch (error) {
    console.warn("[ocr-assets] could not download traineddata:", error);
  }
}
