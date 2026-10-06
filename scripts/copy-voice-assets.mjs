import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const STAMP = "small-en-us-0.15-root-1";
const root = fileURLToPath(new URL("..", import.meta.url));
const destDir = join(root, "public", "vosk");
const modelPath = join(destDir, "model.bin");
const wordsPath = join(destDir, "words.txt");
const stampPath = join(destDir, "VERSION");

const SOURCES = [
  "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip",
  "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz",
];

mkdirSync(destDir, { recursive: true });
writeFileSync(join(destDir, ".gitkeep"), "");

function assetsLookValid() {
  if (!existsSync(modelPath) || statSync(modelPath).size < 30_000_000) return false;
  if (!existsSync(wordsPath)) return false;
  const words = readFileSync(wordsPath, "utf8");
  if (!words.includes("\nyellow\n") || !words.includes("\n[unk]\n")) return false;
  try {
    const listing = execFileSync("tar", ["-tzf", modelPath], { encoding: "utf8" });
    return listing.includes("vosk-model-small-en-us-0.15/am/final.mdl");
  } catch {
    return false;
  }
}

if (assetsLookValid()) {
  writeFileSync(stampPath, `${STAMP}\n`);
  console.log("[voice-assets] model and vocabulary already present");
  process.exit(0);
}

const work = join(tmpdir(), `herd-check-vosk-${process.pid}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

try {
  let archive = "";
  for (const url of SOURCES) {
    try {
      console.log(`[voice-assets] downloading ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      const ext = url.endsWith(".zip") ? "zip" : "tar.gz";
      archive = join(work, `model.${ext}`);
      writeFileSync(archive, bytes);
      console.log(`[voice-assets] saved ${bytes.length} bytes`);
      break;
    } catch (error) {
      console.warn(`[voice-assets] ${url} failed:`, error instanceof Error ? error.message : error);
      archive = "";
    }
  }
  if (!archive) throw new Error("no model download succeeded");

  if (archive.endsWith(".zip")) execFileSync("unzip", ["-q", "-o", archive, "-d", work]);
  else execFileSync("tar", ["-xzf", archive, "-C", work]);

  const modelDir = join(work, "vosk-model-small-en-us-0.15");
  const fstPath = join(modelDir, "graph", "Gr.fst");
  if (!existsSync(fstPath)) throw new Error(`missing ${fstPath}`);

  const words = extractWords(fstPath);
  writeFileSync(wordsPath, `${[...new Set(words)].sort().join("\n")}\n`);
  // vosk-browser strips the first archive folder, so the model directory must be the top entry.
  execFileSync("tar", [
    "-C",
    work,
    "--exclude=._*",
    "-czf",
    modelPath,
    "vosk-model-small-en-us-0.15",
  ]);
  writeFileSync(stampPath, `${STAMP}\n`);
  console.log(
    `[voice-assets] packed model (${statSync(modelPath).size} bytes) and ${words.length} words`,
  );
} catch (error) {
  console.warn(
    "[voice-assets] could not prepare the offline speech model:",
    error instanceof Error ? error.message : error,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}

/** Pull the word list embedded in the model's Gr.fst symbol table. */
function extractWords(fstPath) {
  const blob = readFileSync(fstPath);
  const magic = Buffer.from([0x74, 0xfb, 0xb2, 0x7e]);
  const start = blob.indexOf(magic);
  if (start < 0) throw new Error("Gr.fst has no symbol table");
  let off = start + 4;
  const nameLen = blob.readInt32LE(off);
  off += 4 + nameLen + 8;
  const count = Number(blob.readBigInt64LE(off));
  off += 8;
  const words = [];
  for (let i = 0; i < count; i += 1) {
    const len = blob.readInt32LE(off);
    off += 4;
    if (len < 0 || len > 200) throw new Error(`bad symbol length at ${i}`);
    words.push(blob.toString("utf8", off, off + len));
    off += len + 8;
  }
  if (!words.includes("yellow") || !words.includes("[unk]")) {
    throw new Error("vocabulary did not look like the English model");
  }
  return words;
}
