/* Generates the voice-over with Kokoro, an open-source neural voice model
   (Apache-2.0, https://github.com/hexgrad/kokoro) that runs on this PC.
   Natural-sounding, free, no account; the model (~330 MB) downloads from
   Hugging Face the first time and is cached after that, so later runs work
   offline. The script text comes from NARRATION in cues.js.

     npm run voice                                   → default voice (af_heart)
     node tools/make-voice-neural.mjs --voice am_michael
     node tools/make-voice-neural.mjs --speed 1.05   → a little faster
     node tools/make-voice-neural.mjs --samples      → audio/samples/: the intro line in several voices

   Each line is saved as audio/vo/<id>.wav. Then run `npm run audio`
   (and `npm run export`) to rebuild the film's sound.
*/
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import ffmpegPath from "ffmpeg-static";
import { KokoroTTS } from "kokoro-js";
import { ROOT, arg } from "./render-common.mjs";

const { NARRATION } = createRequire(import.meta.url)(path.join(ROOT, "cues.js"));

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = "af_heart";   // warm, clear, the model's best-rated voice
const SAMPLE_VOICES = ["af_heart", "af_bella", "af_nicole", "am_michael", "am_fenrir", "bf_emma", "bm_george", "bm_fable"];

const speed = Number(arg("speed", 1));

// Float samples → 16-bit WAV at the model's rate, then ffmpeg resamples to 44.1 kHz.
function saveWav(samples, rate, outFile) {
  const tmp = outFile.replace(/\.wav$/, ".24k.wav");
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(tmp, buf);
  const r = spawnSync(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-i", tmp, "-af", "aresample=44100:resampler=soxr", "-ac", "1", "-c:a", "pcm_s16le", outFile]);
  if (r.status !== 0) {
    // Fall back to the default resampler if this ffmpeg build lacks soxr.
    const r2 = spawnSync(ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error", "-i", tmp, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", outFile]);
    if (r2.status !== 0) throw new Error(`ffmpeg could not convert ${outFile}: ${r2.stderr}`);
  }
  fs.unlinkSync(tmp);
  return samples.length / rate;
}

console.log(`Loading Kokoro (${MODEL}) — the first run downloads the model…`);
const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: "fp32", device: "cpu" });

async function say(text, voice, outFile) {
  const audio = await tts.generate(text, { voice, speed });
  return saveWav(audio.audio, audio.sampling_rate, outFile);
}

if (arg("samples", false)) {
  const dir = path.join(ROOT, "audio", "samples");
  fs.mkdirSync(dir, { recursive: true });
  for (const voice of SAMPLE_VOICES) {
    const secs = await say(NARRATION[0].text, voice, path.join(dir, `${voice}.wav`));
    console.log(`  audio/samples/${voice}.wav  ${secs.toFixed(1)}s`);
  }
  console.log("\nListen, then: node tools/make-voice-neural.mjs --voice <name>");
} else {
  const voice = typeof arg("voice") === "string" ? arg("voice") : DEFAULT_VOICE;
  const dir = path.join(ROOT, "audio", "vo");
  fs.mkdirSync(dir, { recursive: true });
  console.log(`Voice: ${voice}  speed ${speed}`);
  for (const n of NARRATION) {
    const secs = await say(n.text, voice, path.join(dir, `${n.id}.wav`));
    const room = n.end - n.start;
    console.log(`  ${n.id.padEnd(11)} ${secs.toFixed(1)}s of ${room.toFixed(1)}s${secs > room ? "  ← too long, try --speed 1.08" : ""}`);
  }
  fs.writeFileSync(path.join(dir, "VOICE.txt"), `Kokoro-82M (${voice}, speed ${speed}), generated ${new Date().toISOString().slice(0, 10)}\n`);
  console.log("\nNow run: npm run audio");
}
