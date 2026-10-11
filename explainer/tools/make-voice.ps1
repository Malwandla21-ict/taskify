# Fallback only (npm run voice:windows): the default voice is Kokoro, see
# tools/make-voice-neural.mjs. Generates the voice-over (one WAV per line) with the Windows
# speech engine, so the film has a narration track without any online
# service. Replace any file in audio/vo/ with a real recording of the same
# line (same file name, any length that fits the scene) and run
# `npm run audio` again to rebuild the soundtrack.
#
#   powershell -ExecutionPolicy Bypass -File tools/make-voice.ps1 [-Voice "Microsoft Zira Desktop"] [-Rate 0]

param(
  [string]$Voice = "Microsoft Zira Desktop",
  [int]$Rate = 0
)

Add-Type -AssemblyName System.Speech
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "audio\vo"
New-Item -ItemType Directory -Force $outDir | Out-Null

# Keep in sync with NARRATION in cues.js (the film reads its captions there).
$lines = [ordered]@{
  "01-intro"   = "Meet Taskify: a campus-focused platform that brings student opportunities, buying and selling, and equipment rentals together, in one place."
  "02-tasks"   = "Need help with something, or have a skill you can offer? With Tasks, students can discover opportunities, connect around work that needs doing, and turn their time and skills into value."
  "03-sales"   = "Looking for something you need, or have something you no longer use? Sales helps students discover items from their campus community, and gives sellers a place to showcase what they have."
  "04-rentals" = "Need equipment without buying it outright? Rentals helps students find items they can use when they need them, while giving owners an opportunity to make their resources available to others."
  "05-outro"   = "Whether you're finding help, discovering your next purchase, or renting what you need, Taskify brings more campus opportunities within reach. One platform. Three ways to make student life easier."
}

$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

foreach ($key in $lines.Keys) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice($Voice)
  $synth.Rate = $Rate
  $path = Join-Path $outDir "$key.wav"
  $synth.SetOutputToWaveFile($path, $format)
  $synth.Speak($lines[$key])
  $synth.Dispose()
  $bytes = (Get-Item $path).Length
  "{0}  {1:N2}s" -f $key, (($bytes - 44) / 88200)
}
