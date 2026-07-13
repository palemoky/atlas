// Copies raw/*.json (git-managed source of truth) into public/data/ so the
// app can fetch them as static assets. Runs automatically before dev/build.
import { readdirSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(here, "..", "raw");
const outDir = path.join(here, "public", "data");

mkdirSync(outDir, { recursive: true });

const files = readdirSync(rawDir).filter((f) => f.endsWith(".json"));
for (const f of files) {
  copyFileSync(path.join(rawDir, f), path.join(outDir, f));
  console.log(`synced raw/${f} -> web/public/data/${f}`);
}
