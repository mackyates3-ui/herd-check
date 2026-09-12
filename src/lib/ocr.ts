import Tesseract from "tesseract.js";
import { applyOcrDigitHints, parseTagCandidate } from "./tags";

type Worker = Tesseract.Worker;

export interface OcrResult {
  text: string;
  candidate: string;
  confidence: number;
}

const TESSERACT_PATHS = {
  workerPath: "/tesseract/worker.min.js",
  langPath: "/tesseract",
  corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
};

let workerPromise: Promise<Worker> | null = null;

export function warmupOcr(): void {
  void getWorker();
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await Tesseract.createWorker("eng", 1, {
        workerPath: TESSERACT_PATHS.workerPath,
        langPath: TESSERACT_PATHS.langPath,
        corePath: TESSERACT_PATHS.corePath,
        gzip: true,
        workerBlobURL: false,
      });
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
      });
      return worker;
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

export function preprocessTagFrame(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
  dest: HTMLCanvasElement,
): HTMLCanvasElement {
  const srcW =
    "videoWidth" in source && source.videoWidth
      ? source.videoWidth
      : source.width;
  const srcH =
    "videoHeight" in source && source.videoHeight
      ? source.videoHeight
      : source.height;

  const roiW = srcW * 0.62;
  const roiH = srcH * 0.28;
  const sx = (srcW - roiW) / 2;
  const sy = (srcH - roiH) / 2;

  const outW = 720;
  const outH = Math.max(160, Math.round((roiH / roiW) * outW));
  dest.width = outW;
  dest.height = outH;

  const ctx = dest.getContext("2d", { willReadFrequently: true });
  if (!ctx) return dest;

  ctx.drawImage(source, sx, sy, roiW, roiH, 0, 0, outW, outH);
  const image = ctx.getImageData(0, 0, outW, outH);
  enhanceTagPixels(image.data, outW, outH);
  ctx.putImageData(image, 0, 0);
  return dest;
}

/** Grayscale, stretch contrast, Otsu threshold. Tuned for yellow/orange tags. */
export function enhanceTagPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const n = width * height;
  const gray = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const r = data[i * 4] ?? 0;
    const g = data[i * 4 + 1] ?? 0;
    const b = data[i * 4 + 2] ?? 0;
    // Emphasize dark ink on yellow/orange plastic.
    gray[i] = Math.round(0.25 * r + 0.55 * g + 0.2 * b);
  }

  let min = 255;
  let max = 0;
  for (const v of gray) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(max - min, 1);
  for (let i = 0; i < n; i++) {
    const stretched = Math.round(((gray[i]! - min) / span) * 255);
    gray[i] = clampByte(Math.round((stretched - 128) * 1.45 + 128));
  }

  const threshold = otsu(gray);
  const mean =
    gray.reduce((sum, v) => sum + v, 0) / Math.max(gray.length, 1);
  const invert = mean < 118;

  for (let i = 0; i < n; i++) {
    let bit = gray[i]! > threshold ? 255 : 0;
    if (invert) bit = 255 - bit;
    const p = i * 4;
    data[p] = bit;
    data[p + 1] = bit;
    data[p + 2] = bit;
    data[p + 3] = 255;
  }
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, n));
}

export function otsu(gray: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of gray) hist[v]! += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      threshold = t;
    }
  }
  return threshold;
}

export async function recognizeTag(
  canvas: HTMLCanvasElement,
): Promise<OcrResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  const raw = (data.text ?? "").trim();
  const hinted = applyOcrDigitHints(raw);
  const candidate = parseTagCandidate(hinted || raw);
  return {
    text: raw,
    candidate,
    confidence: data.confidence ?? 0,
  };
}

export function renderDemoTag(
  canvas: HTMLCanvasElement,
  tag: string,
  fill = "#F4C430",
): HTMLCanvasElement {
  canvas.width = 640;
  canvas.height = 280;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111";
  ctx.font = "bold 140px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tag, canvas.width / 2, canvas.height / 2 + 8);
  return canvas;
}
