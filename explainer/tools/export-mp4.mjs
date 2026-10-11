/* Renders the explainer to an MP4 (1920×1080, 30 fps, H.264 + AAC).

     npm run export                                  → output/taskify-explainer.mp4
     node tools/export-mp4.mjs --captions            → captions burned into the picture
     node tools/export-mp4.mjs --from 27.5 --to 43.5 → just the Sales scene
     node tools/export-mp4.mjs --silent              → no soundtrack
     node tools/export-mp4.mjs --out my-cut.mp4

   Every frame is drawn by seeking the film to that exact time and taking
   a screenshot, so the video is frame-accurate however fast the PC is.
   Run `npm run audio` first if you changed the voice-over or cues.
*/
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { openFilm, arg, ROOT } from "./render-common.mjs";

const captions = !!arg("captions", false);
const silent = !!arg("silent", false);
const out = path.resolve(ROOT, arg("out", path.join("output", captions ? "taskify-explainer-captioned.mp4" : "taskify-explainer.mp4")));
const soundtrack = path.join(ROOT, "audio", "soundtrack.wav");
fs.mkdirSync(path.dirname(out), { recursive: true });

const film = await openFilm({ captions });
const fps = Number(arg("fps", film.fps));
const from = Number(arg("from", 0));
const to = Math.min(film.duration, Number(arg("to", film.duration)));
const total = Math.round((to - from) * fps);
const withAudio = !silent && fs.existsSync(soundtrack);
if (!silent && !withAudio) console.warn("! audio/soundtrack.wav not found — run `npm run audio` first. Exporting without sound.");

const ffArgs = [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  ...(withAudio ? ["-ss", String(from), "-t", String(to - from), "-i", soundtrack] : []),
  "-map", "0:v", ...(withAudio ? ["-map", "1:a", "-c:a", "aac", "-b:a", "192k"] : []),
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-profile:v", "high",
  "-r", String(fps), "-movflags", "+faststart", "-shortest", out
];
const ff = spawn(ffmpegPath, ffArgs, { stdio: ["pipe", "inherit", "inherit"] });
const ffDone = new Promise((res, rej) => ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}`)))));

const started = Date.now();
for (let i = 0; i < total; i++) {
  const t = from + i / fps;
  const jpg = await film.frame(t, "jpeg", 95);
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % fps === 0 || i === total - 1) {
    const done = (i + 1) / total, secs = (Date.now() - started) / 1000;
    process.stdout.write(`\r  frame ${i + 1}/${total}  ${(done * 100).toFixed(0)}%  ~${Math.max(0, Math.round(secs / done - secs))}s left   `);
  }
}
ff.stdin.end();
await ffDone;
await film.close();
console.log(`\nSaved ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB, ${(to - from).toFixed(1)}s at ${fps} fps)`);
