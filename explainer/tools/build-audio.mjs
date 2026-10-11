/* Builds the film's soundtrack from cues.js:

     audio/vo/*.wav        voice-over lines (tools/make-voice.ps1, or your own recordings)
   → audio/soundtrack.wav  music + sound effects + voice-over   (player "Voice: recorded", MP4)
   → audio/music-sfx.wav   music + sound effects only           (player "Voice: natural"/"off")
   → audio/timing.json     real length of each voice line       (captions follow the voice)
   → output/taskify-explainer.srt / .vtt   captions for the MP4

   The music and effects are synthesised here (no samples, nothing to
   license). Deterministic: the same inputs always give the same file.

     node tools/build-audio.mjs
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const cues = createRequire(import.meta.url)(path.join(ROOT, "cues.js"));
const { DURATION, NARRATION, SFX, T, SCENES } = cues;

const SR = 44100;
const N = Math.ceil(DURATION * SR);
const TAU = Math.PI * 2;

/* ── WAV in/out ── */
function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error(`${file} is not a WAV file`);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString("ascii", p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === "fmt ") fmt = { format: b.readUInt16LE(p + 8), channels: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === "data") data = b.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${file}: missing fmt/data chunk`);
  if (fmt.format !== 1 || fmt.bits !== 16) throw new Error(`${file}: only 16-bit PCM WAV is supported (export your recording as 16-bit WAV)`);
  const frames = data.length / (2 * fmt.channels);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) s += data.readInt16LE((i * fmt.channels + c) * 2);
    out[i] = s / fmt.channels / 32768;
  }
  if (fmt.rate === SR) return out;
  // Linear resample (recordings at 48 kHz etc.)
  const ratio = fmt.rate / SR, len = Math.floor(frames / ratio), rs = new Float32Array(len);
  for (let i = 0; i < len; i++) { const x = i * ratio, i0 = Math.floor(x), f = x - i0; rs[i] = out[i0] * (1 - f) + (out[i0 + 1] ?? 0) * f; }
  return rs;
}

function writeWav(file, L, R) {
  const frames = L.length, buf = Buffer.alloc(44 + frames * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + frames * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

/* ── Small DSP kit ── */
let seed = 1234567;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const noise = () => rand() * 2 - 1;
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

function onePoleLP(x, cutoff) {
  const a = Math.exp(-TAU * cutoff / SR); let y = 0;
  for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; x[i] = y; }
  return x;
}
function biquadBP(x, f0, q) {
  const w = TAU * f0 / SR, al = Math.sin(w) / (2 * q), cw = Math.cos(w);
  const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
function add(L, R, src, startSec, gain = 1, pan = 0) {
  const s0 = Math.round(startSec * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < src.length; i++) { const j = s0 + i; if (j < 0 || j >= L.length) continue; L[j] += src[i] * gl; R[j] += src[i] * gr; }
}

/* ── Sound effects ── */
const SYNTH = {
  click() { // soft UI tap
    const n = Math.round(0.05 * SR), x = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; x[i] = (Math.sin(TAU * 1900 * t) * 0.6 + noise() * 0.4) * Math.exp(-t * 130); }
    return biquadBP(x, 2600, 1.2);
  },
  tick() {
    const n = Math.round(0.06 * SR), x = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / SR; x[i] = Math.sin(TAU * 2350 * t) * Math.exp(-t * 70); }
    return x;
  },
  pop() {
    const n = Math.round(0.16 * SR), x = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR, f = 520 + 520 * Math.exp(-t * 40); ph += TAU * f / SR; x[i] = Math.sin(ph) * Math.exp(-t * 26) * Math.min(1, t * 400); }
    return x;
  },
  swish() {
    const n = Math.round(0.32 * SR), x = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / n; x[i] = noise() * Math.sin(Math.PI * t) ** 2; }
    biquadBP(x, 3200, 0.7);
    return onePoleLP(x, 7000);
  },
  whoosh() {
    const n = Math.round(0.9 * SR), x = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = i / n; x[i] = noise() * Math.sin(Math.PI * Math.pow(t, 0.7)) ** 2; }
    // sweep: blend of two band-passed copies
    const lo = biquadBP(Float32Array.from(x), 500, 0.8), hi = biquadBP(Float32Array.from(x), 2400, 0.8);
    for (let i = 0; i < n; i++) { const t = i / n; x[i] = lo[i] * (1 - t) + hi[i] * t; }
    return x;
  },
  chime() { // two bright partials, brand "success"
    const n = Math.round(1.4 * SR), x = new Float32Array(n);
    const notes = [[midi(84), 0], [midi(88), 0.07], [midi(91), 0.14]];
    for (const [f, d] of notes) for (let i = Math.round(d * SR); i < n; i++) {
      const t = i / SR - d;
      x[i] += (Math.sin(TAU * f * t) + 0.25 * Math.sin(TAU * f * 2.01 * t)) * Math.exp(-t * 3.2) * Math.min(1, t * 300) * 0.4;
    }
    return x;
  },
  shimmer() {
    const n = Math.round(2.6 * SR), x = new Float32Array(n);
    const fs_ = [midi(86), midi(90), midi(93), midi(97), midi(98)];
    fs_.forEach((f, k) => {
      for (let i = 0; i < n; i++) {
        const t = i / SR, d = k * 0.09;
        if (t < d) continue;
        const u = t - d;
        x[i] += Math.sin(TAU * f * u + Math.sin(TAU * 5 * u) * 0.4) * Math.min(1, u * 6) * Math.exp(-u * 1.6) * 0.22;
      }
    });
    return x;
  },
  type() { // a burst of soft key taps
    const n = Math.round(1.0 * SR), x = new Float32Array(n);
    for (let k = 0; k < 8; k++) {
      const s = Math.round((k * 0.115 + rand() * 0.02) * SR);
      for (let i = 0; i < 0.03 * SR && s + i < n; i++) { const t = i / SR; x[s + i] += noise() * Math.exp(-t * 220) * 0.8; }
    }
    return biquadBP(x, 3600, 1.4);
  }
};

/* ── Music: warm, light, 100 BPM ── */
function buildMusic(L, R) {
  const BPM = 100, beat = 60 / BPM, bar = beat * 4;
  // D major family: Dmaj9 – Bm9 – Gmaj9 – A6sus
  const CHORDS = [
    [50, 57, 61, 64, 66], [47, 54, 57, 61, 62], [43, 50, 54, 57, 59], [45, 52, 54, 57, 59]
  ];
  const endAt = T.endCard;               // groove stops, end chord rings out
  const groove0 = T.frameIn;             // beat starts when the product appears
  const padL = new Float32Array(N), padR = new Float32Array(N);

  // Pad: additive saw-ish voices with slow attack, per bar
  const bars = Math.ceil(endAt / bar);
  for (let b = 0; b < bars + 1; b++) {
    const final = b * bar >= endAt - 0.01;
    const chord = final ? [50, 57, 62, 64, 69, 73] : CHORDS[b % 4];
    const start = final ? endAt : b * bar;
    const len = final ? DURATION - endAt : bar + 0.8;
    const s0 = Math.round(start * SR), n = Math.round(len * SR);
    chord.forEach((m, ni) => {
      const f = midi(m + 12 * (ni > 2 ? 0 : 0));
      [-0.0011, 0, 0.0013].forEach((det, di) => {
        const ff = f * (1 + det), pan = (di - 1) * 0.6;
        const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
        for (let i = 0; i < n; i++) {
          const j = s0 + i; if (j >= N) break;
          const t = i / SR;
          const att = Math.min(1, t / (final ? 0.9 : 0.5));
          const rel = final ? Math.min(1, (len - t) / 3.5) : Math.min(1, (len - t) / 0.8);
          let v = 0;
          for (let h = 1; h <= 5; h++) v += Math.sin(TAU * ff * h * t + h) / (h * h);
          v *= att * rel * 0.022;
          padL[j] += v * gl; padR[j] += v * gr;
        }
      });
    });
  }
  onePoleLP(padL, 1500); onePoleLP(padR, 1500);

  // Pluck arpeggio (8ths) + sub bass + soft kick + shaker
  const ARP = [0, 2, 1, 3, 4, 3, 2, 1];
  for (let t = groove0; t < endAt; t += beat / 2) {
    const k = Math.round((t - groove0) / (beat / 2));
    const b = Math.floor(t / bar), chord = CHORDS[b % 4];
    const note = chord[ARP[k % 8] % chord.length] + 12;
    const f = midi(note), n = Math.round(0.5 * SR), x = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = i / SR; x[i] = (Math.sin(TAU * f * u) + 0.3 * Math.sin(TAU * 2 * f * u) + 0.08 * Math.sin(TAU * 3 * f * u)) * Math.exp(-u * 9) * Math.min(1, u * 500); }
    const intro = Math.min(1, (t - groove0) / 2);
    add(L, R, x, t, 0.085 * intro, k % 2 ? 0.35 : -0.35);
  }
  for (let t = groove0; t < endAt; t += beat) {
    const beatIdx = Math.round((t - groove0) / beat);
    const b = Math.floor(t / bar), root = CHORDS[b % 4][0] - 12;
    if (beatIdx % 2 === 0) {
      const n = Math.round(0.45 * SR), bass = new Float32Array(n), kick = new Float32Array(Math.round(0.25 * SR));
      for (let i = 0; i < n; i++) { const u = i / SR; bass[i] = Math.sin(TAU * midi(root) * u) * Math.exp(-u * 4) * Math.min(1, u * 200); }
      let ph = 0;
      for (let i = 0; i < kick.length; i++) { const u = i / SR; ph += TAU * (45 + 80 * Math.exp(-u * 35)) / SR; kick[i] = Math.sin(ph) * Math.exp(-u * 18); }
      add(L, R, bass, t, 0.11);
      add(L, R, kick, t, 0.16);
    }
    const sh = new Float32Array(Math.round(0.07 * SR));
    for (let i = 0; i < sh.length; i++) sh[i] = noise() * Math.exp(-(i / SR) * 60);
    biquadBP(sh, 8000, 0.9);
    add(L, R, sh, t + beat / 2, 0.035, 0.25);
  }
  for (let i = 0; i < N; i++) { L[i] += padL[i]; R[i] += padR[i]; }

  // Breathe: open in, gentle fade at the very end
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const g = Math.min(1, t / 1.2) * Math.min(1, (DURATION - t) / 1.6);
    L[i] *= g; R[i] *= g;
  }
}

/* ── Build ── */
const voDir = path.join(ROOT, "audio", "vo");
const voice = new Float32Array(N);
const timing = {};
let problems = 0;
for (const line of NARRATION) {
  const file = path.join(voDir, `${line.id}.wav`);
  if (!fs.existsSync(file)) { console.warn(`! missing ${path.relative(ROOT, file)} — run "npm run voice" or add a recording`); problems++; continue; }
  let x = readWav(file);
  // Trim leading/trailing silence so the line lands on its cue.
  const thr = 0.01;
  let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b]) < thr) b--;
  x = x.subarray(Math.max(0, a - Math.round(0.02 * SR)), Math.min(x.length, b + Math.round(0.12 * SR)));
  const dur = x.length / SR;
  timing[line.id] = Math.round(dur * 100) / 100;
  if (line.start + dur > line.end) { console.warn(`! ${line.id} is ${dur.toFixed(2)}s and runs past its slot (${line.start}s–${line.end}s)`); problems++; }
  const s0 = Math.round(line.start * SR);
  for (let i = 0; i < x.length && s0 + i < N; i++) voice[s0 + i] += x[i];
  console.log(`  voice ${line.id.padEnd(11)} ${line.start.toFixed(1)}s → ${(line.start + dur).toFixed(1)}s`);
}
// Even out voice level (peak to −3 dBFS).
let vPeak = 0; for (let i = 0; i < N; i++) vPeak = Math.max(vPeak, Math.abs(voice[i]));
if (vPeak > 0) { const g = 0.7 / vPeak; for (let i = 0; i < N; i++) voice[i] *= g; }

const mL = new Float32Array(N), mR = new Float32Array(N);
buildMusic(mL, mR);

// Duck the music under the voice (smooth envelope, ~-8 dB).
const duck = new Float32Array(N);
{
  const att = Math.exp(-1 / (0.08 * SR)), rel = Math.exp(-1 / (0.6 * SR));
  let env = 0, hold = 0;
  for (let i = 0; i < N; i++) {
    const v = Math.abs(voice[i]) > 0.02 ? 1 : 0;
    if (v) hold = Math.round(0.35 * SR); else if (hold > 0) hold--;
    const target = v || hold > 0 ? 1 : 0;
    env = target > env ? att * env + (1 - att) * target : rel * env + (1 - rel) * target;
    duck[i] = 1 - 0.6 * env;
  }
}

const fxL = new Float32Array(N), fxR = new Float32Array(N);
for (const [time, kind, gain] of SFX) {
  const gen = SYNTH[kind];
  if (!gen) { console.warn(`! unknown sound effect "${kind}"`); continue; }
  add(fxL, fxR, gen(), time, gain * 0.55, kind === "swish" ? 0.2 : 0);
}

function master(withVoice) {
  const L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const d = withVoice ? duck[i] : 0.85;
    L[i] = mL[i] * d + fxL[i] + (withVoice ? voice[i] : 0);
    R[i] = mR[i] * d + fxR[i] + (withVoice ? voice[i] : 0);
  }
  // Soft limit, then normalise to −1 dBFS.
  let peak = 0;
  for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.2) / 1.2; R[i] = Math.tanh(R[i] * 1.2) / 1.2; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
  const g = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < N; i++) { L[i] *= g; R[i] *= g; }
  return [L, R];
}

fs.mkdirSync(path.join(ROOT, "audio"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "output"), { recursive: true });
writeWav(path.join(ROOT, "audio", "soundtrack.wav"), ...master(true));
writeWav(path.join(ROOT, "audio", "music-sfx.wav"), ...master(false));
fs.writeFileSync(path.join(ROOT, "audio", "timing.json"), JSON.stringify({ lines: timing }, null, 2));

/* Captions: each line split into readable chunks, timed by the real voice. */
function chunks(text) {
  const parts = text.match(/[^,.?—]+[,.?—]?/g).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) { if (out.length && out[out.length - 1].length + p.length < 58) out[out.length - 1] += " " + p; else out.push(p); }
  return out.map((c) => c.replace(/[,—]$/, "").trim());
}
const stamp = (s, sep) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}${sep}${String(ms % 1000).padStart(3, "0")}`;
};
const cues_ = [];
for (const line of NARRATION) {
  const dur = timing[line.id] || line.end - line.start;
  const cs = chunks(line.text), total = cs.reduce((s, c) => s + c.length, 0);
  let t = line.start;
  for (const c of cs) { const d = dur * c.length / total; cues_.push([t, t + d, c]); t += d; }
}
fs.writeFileSync(path.join(ROOT, "output", "taskify-explainer.srt"), cues_.map(([a, b, c], i) => `${i + 1}\n${stamp(a, ",")} --> ${stamp(b, ",")}\n${c}\n`).join("\n"));
fs.writeFileSync(path.join(ROOT, "output", "taskify-explainer.vtt"), "WEBVTT\n\n" + cues_.map(([a, b, c]) => `${stamp(a, ".")} --> ${stamp(b, ".")}\n${c}\n`).join("\n"));

console.log(`\nWrote audio/soundtrack.wav, audio/music-sfx.wav, audio/timing.json and output/taskify-explainer.srt/.vtt (${DURATION}s, ${SCENES.length} scenes).`);
if (problems) { console.log(`${problems} warning(s) above.`); process.exitCode = 0; }
