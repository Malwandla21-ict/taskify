# Taskify — product explainer (75 s)

A short animated walkthrough of **Tasks**, **Sales** and **Rentals**, built from the
real Taskify interface. It lives here, separate from the app: nothing in
`frontend/` or `backend/` was changed to make it.

| File | What it is |
|---|---|
| `output/taskify-explainer.mp4` | The full-quality video (1920×1080, 30 fps, H.264 + AAC). Not in git: rebuild it with `npm run audio` then `npm run export` |
| `frontend/assets/videos/taskify-tour.mp4` | The smaller website copy (9 MB) played on the landing page and the dashboard welcome pop-up |
| `output/taskify-explainer.srt` / `.vtt` | Captions (load them in your player, or upload with the video) |
| `index.html` | The playable film, with controls |

## Watch it

```bash
npm run serve
```

Then open <http://127.0.0.1:5502/explainer/>. Controls: **Space** play/pause,
**← / →** 5 s, **R** replay, **C** captions, **M** mute, **F** full screen. The
voice menu offers the recorded track, a **natural browser voice** (best in
Microsoft Edge, which has warm "Natural" voices including South African English),
or no voice.

## How it stays true to the product

* The app inside the browser frame is drawn with Taskify's own stylesheets
  (`frontend/css/main.css`, `profile.css`, `layout-v2.css`), its own helper code
  (`frontend/js/helpers.js` builds the badges, avatars, money rows and rental terms),
  and its own logo animation (`frontend/js/taskify-motion.js`).
* Card and detail markup in `app-data.js` is copied from `tasks.js`, `sales.js`,
  `equipment.js` and the three detail pages.
* Only real flows are shown: **Apply for this Task**, which the poster chooses from;
  **Buy with Taskify Protection**, with the money held, a 4-digit handover code and the
  3% fee for items from R300; and **Request Booking**, which is free to send, paid only
  after the owner approves, with a 5% protection fee and no deposit. The statuses in
  the "How it moves" panels are the app's own.
* Payments are labelled **Demo** everywhere, as they are in the app. The narration
  never claims real or secure payments.
* Listing photos are illustrations (`media/`), since real listings use photos
  students upload. Names and listings are sample data.
* The Campus Marketplace (events) link is left out of the sidebar because the film
  covers three modules only.

## Narration script

| Time | Scene | Voice-over | On screen |
|---|---|---|---|
| 0:00–0:09.5 | Introduction | "Meet Taskify — a campus-focused platform that brings student opportunities, buying and selling, and equipment rentals together in one place." | Logo reveal · *Your campus. Your opportunities.* · dashboard · Tasks / Sales / Rentals picked out in the sidebar |
| 0:09.5–0:27.5 | Tasks | "Need help with something, or have a skill you can offer? With Tasks, students can discover opportunities, connect around work that needs doing, and turn their time and skills into value." | Browse tasks → open the Java tutoring task → **Apply for this Task** with a note → "Your application" (Pending) → *How a task moves*: Posted → Accepted → In Progress → Awaiting Confirmation → Completed |
| 0:27.5–0:43.5 | Sales | "Looking for something you need, or have something you no longer use? Sales helps students discover items from their campus community and gives sellers a place to showcase what they have." | Search "textbook" → open the R350 textbook → **Buy with Taskify Protection** (R350 + R10.50 fee, demo) → payment held, handover code 4817 → back to the listings |
| 0:43.5–0:59.5 | Rentals | "Need equipment without buying it outright? Rentals helps students find items they can use when they need them, while giving owners an opportunity to make their resources available to others." | Sales cards hand over to rental cards → camera kit, R120/day → **Request Booking** for 15–16 Oct → R240 + R12 fee, no deposit → request sent → *How a rental moves* |
| 0:59.5–1:15 | The bigger picture | "Whether you're finding help, discovering your next purchase, or renting what you need, Taskify brings more campus opportunities within reach. One platform. Three ways to make student life easier." | Pull back to the dashboard → three module cards → **TASKIFY** · *Tasks. Sales. Rentals.* · *Your campus. Your opportunities.* |

Every timing lives in one file, `cues.js`. The picture, voice, sound effects and
captions all read from it.

## Export the MP4

Needs Node 18+ and Chrome or Edge, both already on this PC.

```bash
npm install
```

```bash
npm run audio
```

```bash
npm run export
```

`npm run audio` builds `audio/soundtrack.wav` from the voice lines, music and sound
effects. `npm run export` renders every frame in headless Chrome and encodes
`output/taskify-explainer.mp4`, which takes a few minutes. Useful options:

```bash
node tools/export-mp4.mjs --captions
```

That burns the captions into the picture (`taskify-explainer-captioned.mp4`). Use
`--from 27.5 --to 43.5` to render a single scene, `--silent` to render without sound,
and `--out name.mp4` to set the file name.

To check frames without rendering everything:

```bash
npm run stills
```

This writes frames to `output/stills/`.

## The voice-over

The narration uses **Kokoro**, an open-source neural voice model
([hexgrad/kokoro](https://github.com/hexgrad/kokoro), Apache-2.0) that runs on
this PC: no account, no cost, and no text sent anywhere. The first run downloads
the model (about 330 MB) from Hugging Face; after that it works offline. The
default voice is `af_heart`, a warm, clear US English voice.

**Try another voice.** `audio/samples/` has the opening line read by eight voices:

| Voice | Sound |
|---|---|
| `af_heart` | US female, warm (current) |
| `af_bella` | US female, bright |
| `af_nicole` | US female, soft and slow (too long for the slots) |
| `am_michael` | US male, steady |
| `am_fenrir` | US male, deeper |
| `bf_emma` | British female |
| `bm_george` | British male, mature |
| `bm_fable` | British male, lighter |

To switch, run these three commands:

```bash
node tools/make-voice-neural.mjs --voice am_michael
```

```bash
npm run audio
```

```bash
npm run export
```

Add `--speed 1.05` if a voice runs long. `npm run audio` warns when a line doesn't
fit its slot.

**Use a human recording instead.** Record the five lines in the script above and
save them as 16-bit WAV files in `audio/vo/`, named `01-intro.wav` to `05-outro.wav`.
Then run `npm run audio` and `npm run export`. Each line starts at its cue, and the
music dips under it automatically.

The old Windows voice is still available as `npm run voice:windows`, but it sounds
robotic.

## Files

```
explainer/
  index.html, film.js, film.css   the film: stage, camera, titles, callouts, end card, player
  app.html, app-film.js/.css      the Taskify screens inside the browser frame
  app-data.js                     sample listings + markup copied from the app
  cues.js                         the timeline (scenes, narration, every beat, sound cues)
  media/                          listing illustrations
  audio/vo/                       voice-over lines
  tools/                          serve, voice, audio build, stills, MP4 export
```
