import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "fonts");
mkdirSync(dest, { recursive: true });

const families = [
  {
    file: "figtree.woff2",
    css: "https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap",
  },
  {
    file: "fraunces.woff2",
    css: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap",
  },
  {
    file: "ibm-plex-mono.woff2",
    css: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&display=swap",
  },
];

const ua =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

for (const family of families) {
  const cssRes = await fetch(family.css, { headers: { "User-Agent": ua } });
  if (!cssRes.ok) throw new Error(`CSS ${family.file}: ${cssRes.status}`);
  const css = await cssRes.text();
  const match = css.match(/https:\/\/fonts\.gstatic\.com\/s\/[^)]+\.woff2/);
  if (!match) throw new Error(`No woff2 URL for ${family.file}\n${css}`);
  const fontRes = await fetch(match[0]);
  if (!fontRes.ok) throw new Error(`Font ${family.file}: ${fontRes.status}`);
  const buf = Buffer.from(await fontRes.arrayBuffer());
  writeFileSync(join(dest, family.file), buf);
  console.log(`wrote ${family.file} (${buf.length} bytes)`);
}
