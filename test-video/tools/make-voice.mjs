/* Generates the narration with Kokoro (the same local neural voice as the
   explainer video; the model is cached after its first download).

     npm run voice                              → default voice (af_heart)
     node tools/make-voice.mjs --voice bf_emma
     node tools/make-voice.mjs --speed 1.05

   Writes audio/vo/<id>.wav (44.1 kHz mono) and audio/vo/durations.json,
   which record.mjs uses to give each line enough screen time. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { KokoroTTS } from "kokoro-js";
import { NARRATION } from "../script.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const voice = arg("voice", "af_heart");
const speed = Number(arg("speed", 1));
const only = arg("only", null);

function saveWav(samples, rate, outFile) {
  const tmp = outFile.replace(/\.wav$/, ".24k.wav");
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(tmp, buf);
  const r = spawnSync(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-i", tmp, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", outFile]);
  if (r.status !== 0) throw new Error(`ffmpeg could not convert ${outFile}: ${r.stderr}`);
  fs.unlinkSync(tmp);
  return samples.length / rate;
}

const dir = path.join(ROOT, "audio", "vo");
fs.mkdirSync(dir, { recursive: true });
const durationsFile = path.join(dir, "durations.json");
const durations = fs.existsSync(durationsFile) ? JSON.parse(fs.readFileSync(durationsFile, "utf8")) : {};

console.log(`Loading Kokoro — voice ${voice}, speed ${speed}…`);
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp32", device: "cpu" });

for (const line of NARRATION) {
  if (only && line.id !== only) continue;
  const audio = await tts.generate(line.say, { voice, speed });
  durations[line.id] = Number(saveWav(audio.audio, audio.sampling_rate, path.join(dir, `${line.id}.wav`)).toFixed(3));
  console.log(`  ${line.id.padEnd(6)} ${durations[line.id].toFixed(1)}s`);
}
fs.writeFileSync(durationsFile, JSON.stringify(durations, null, 2));
const total = Object.values(durations).reduce((a, b) => a + b, 0);
console.log(`\n${Object.keys(durations).length} lines, ${total.toFixed(0)}s of speech. Now run: npm run record`);
