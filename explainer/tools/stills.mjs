/* Saves still frames for checking the film without rendering all of it.

     node tools/stills.mjs                       → a frame from every beat, half size
     node tools/stills.mjs --times 13.4,38.7     → just these moments
     node tools/stills.mjs --full                → full 1920×1080 PNGs
*/
import fs from "node:fs";
import path from "node:path";
import { openFilm, arg, ROOT } from "./render-common.mjs";

const DEFAULT_TIMES = [1.4, 2.6, 4.0, 6.4, 8.4, 10.8, 13.5, 16.0, 17.8, 19.3, 20.9, 22.6, 24.8, 28.9, 31.4, 32.8, 35.0, 36.4,
  38.6, 41.0, 43.0, 44.1, 45.4, 47.2, 49.0, 50.6, 51.5, 53.2, 54.5, 55.4, 57.6, 60.3, 61.8, 63.6, 65.4, 66.8, 68.4, 70.2, 72.4, 74.2];

const times = typeof arg("times") === "string" ? arg("times").split(",").map(Number) : DEFAULT_TIMES;
const full = !!arg("full", false);
const outDir = path.join(ROOT, "output", "stills");
fs.mkdirSync(outDir, { recursive: true });

const film = await openFilm({ scale: full ? 1 : 0.5, captions: !!arg("captions", false) });
for (const t of times) {
  const buf = await film.frame(t, full ? "png" : "jpeg", 88);
  const file = path.join(outDir, `t${t.toFixed(1).padStart(4, "0")}.${full ? "png" : "jpg"}`);
  fs.writeFileSync(file, buf);
  console.log(`  ${path.relative(ROOT, file)}`);
}
await film.close();
