const pool = require("../config/db");

/*
  Thin wrapper around Azure AI Content Safety (text:analyze / image:analyze).
  Switched over from OpenAI's Moderation endpoint on 2026-09-04 — OpenAI's
  API gates all access (even free endpoints) behind having a payment method
  on the org, which blocked every request with a 429. Azure AI Content
  Safety's F0 tier is genuinely free (5 requests/second, no card required
  under an Azure for Students subscription), so this rewrite targets that
  instead. See CONTENT_MODERATION_SETUP.md for how to get an endpoint + key.

  If AZURE_CONTENT_SAFETY_ENDPOINT / AZURE_CONTENT_SAFETY_KEY aren't set —
  or the API call itself fails (outage, bad key, network issue) —
  moderation is skipped and content publishes unchecked rather than
  blocking task/sales/equipment/event creation or image uploads. Same
  "degrade gracefully" approach as mailer.service.js takes for SMTP.

  Azure's Content Safety only exposes four broad categories (Hate,
  SelfHarm, Sexual, Violence) — narrower than OpenAI's 13, with no
  dedicated "sexual/minors" or general "harassment" categories. Each
  category comes back with a 0/2/4/6 severity score instead of a plain
  yes/no, which is actually a better fit for the policy below: rather than
  a fixed severe-category list, a per-category severity threshold decides
  hard-block vs. soft-flag vs. clean.
*/

const API_VERSION = process.env.AZURE_CONTENT_SAFETY_API_VERSION || "2024-09-01";
const CATEGORIES = ["Hate", "SelfHarm", "Sexual", "Violence"];

/* Minimum severity (on Azure's 0/2/4/6 "FourSeverityLevels" scale) at which
   a category hard-blocks content outright rather than just queuing it for
   review. SelfHarm/Sexual/Violence trip at Medium (4) — deliberately lower
   than "only the most graphic content" (6), since e.g. a plain violent
   threat ("I need someone to hurt/kill someone") reads as Violence at
   Medium-or-above without necessarily scoring the maximum graphic-detail
   severity. Hate is left at High (6) only, since moderate scores there are
   more prone to catching legitimate discussion *about* hateful topics
   (coursework, reporting, quoting) rather than hateful content itself —
   those still get queued for human review instead of being blocked.
   Adjust per-category thresholds here if your policy needs differ. */
const SEVERE_THRESHOLDS = {
  Hate: 6,
  SelfHarm: 4,
  Sexual: 4,
  Violence: 4
};

/* Any category scoring at or above this (but under its severe threshold)
   still publishes, just queued for admin review. Azure's scale starts
   non-zero severities at 2 ("Low"). */
const SOFT_THRESHOLD = 2;

const EMPTY_RESULT = {
  configured: false,
  flagged: false,
  severe: false,
  categories: {},
  flaggedCategories: []
};

/* ── Local keyword/pattern backstop (added 2026-09-04) ──
   Runs entirely offline, before any AI call. Added after testing showed
   that neither OpenAI nor Azure reliably catches a plain first-person
   statement of violent intent ("I need someone to kill someone" scored
   0 across every Azure category, including Violence — verified against
   Microsoft's own documented example to rule out a config problem).
   Deliberately narrow: this is not a general profanity/harassment filter
   (Azure's Hate/Sexual categories, imperfect as they are, already cover
   that ground) — it exists only to hard-block the specific "expressed
   intent to commit violence or self-harm" gap neither AI covers well.
   Normalizes common obfuscation first: leetspeak digit substitution
   (k1ll → kill) and masked vowels (k.ll → kill, treating the punctuation
   as standing in for the missing letter) — consonants must still match
   literally (or their leetspeak form) to keep false positives low, e.g.
   "skill"/"skilled" won't match "kill" because of the letter immediately
   before it. */
const LEETSPEAK_MAP = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };
const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const INTRA_WORD_SEPARATOR = "[^a-z0-9]{0,2}"; // optional punctuation/space inserted between letters, e.g. "k-i-l-l"

/* Multi-word phrases specific enough that there's essentially no benign
   use — nobody says "commit suicide" or "hire a hitman" as an idiom — so
   these hard-block outright, same as a severe AI hit. */
const HARD_BLOCK_PHRASES = [
  "kill myself", "kill himself", "kill herself",
  "commit suicide", "hire a hitman", "hire a killer"
];

/* Bare single words with real idiomatic/benign uses ("kill time", "kill
   the lights", "murder mystery night", "killer app") — testing this
   locally caught exactly that false-positive risk before it ever reached
   real users. These only soft-flag: published, but immediately queued for
   admin review, same outcome as an AI soft hit. That's actually the right
   fix for the original problem — "I need someone to kill [someone]" no
   longer publishes with zero signal to anyone, but a bare ambiguous word
   alone doesn't hard-reject a legitimate post either. */
const SOFT_FLAG_PHRASES = ["kill", "murder", "assassinate", "hitman"];

function escapeRegexChar(ch) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFuzzyWordPattern(word) {
  return word
    .split("")
    .map(ch => (VOWELS.has(ch) ? `(?:${ch}|[^a-z0-9\\s])` : escapeRegexChar(ch)))
    .join(INTRA_WORD_SEPARATOR);
}

function buildPhraseRegex(phrase) {
  const pattern = phrase.split(" ").map(buildFuzzyWordPattern).join("\\s+");
  // Lookaround instead of \b so a masked-vowel match (a non-word character)
  // still requires a non-letter on either side — otherwise "skill" could
  // false-positive match "kill" starting at its second letter.
  return new RegExp(`(?<![a-z])${pattern}(?![a-z])`, "i");
}

function compilePhraseList(phrases) {
  return phrases.map(phrase => ({ phrase, regex: buildPhraseRegex(phrase) }));
}

let compiledHardBlockPatterns = null;
let compiledSoftFlagPatterns = null;

function normalizeLeetspeak(text) {
  return text.toLowerCase().replace(/[013457@$]/g, ch => LEETSPEAK_MAP[ch] ?? ch);
}

function matchAny(normalized, patterns) {
  for (const { phrase, regex } of patterns) {
    if (regex.test(normalized)) return phrase;
  }
  return null;
}

function checkHardBlockKeywords(text) {
  if (!compiledHardBlockPatterns) compiledHardBlockPatterns = compilePhraseList(HARD_BLOCK_PHRASES);
  if (!compiledSoftFlagPatterns) compiledSoftFlagPatterns = compilePhraseList(SOFT_FLAG_PHRASES);

  const normalized = normalizeLeetspeak(text || "");
  const severeMatch = matchAny(normalized, compiledHardBlockPatterns);
  if (severeMatch) return { severe: true, flagged: true, matchedPhrase: severeMatch };

  const softMatch = matchAny(normalized, compiledSoftFlagPatterns);
  if (softMatch) return { severe: false, flagged: true, matchedPhrase: softMatch };

  return { severe: false, flagged: false, matchedPhrase: null };
}

let loggedDisabledNotice = false;

function isConfigured() {
  return Boolean(process.env.AZURE_CONTENT_SAFETY_ENDPOINT && process.env.AZURE_CONTENT_SAFETY_KEY);
}

function warnDisabledOnce() {
  if (!loggedDisabledNotice) {
    console.warn(
      "[moderation] AZURE_CONTENT_SAFETY_ENDPOINT/KEY not set — content moderation is disabled; " +
      "tasks/sales/equipment/events and images will publish unchecked. See CONTENT_MODERATION_SETUP.md."
    );
    loggedDisabledNotice = true;
  }
}

function endpointBase() {
  return String(process.env.AZURE_CONTENT_SAFETY_ENDPOINT).replace(/\/+$/, "");
}

async function callContentSafety(kind, body) {
  const response = await fetch(`${endpointBase()}/contentsafety/${kind}:analyze?api-version=${API_VERSION}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": process.env.AZURE_CONTENT_SAFETY_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Azure Content Safety ${kind} request failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  return data.categoriesAnalysis || [];
}

/* Turns Azure's [{category, severity}, ...] array into the same shape the
   rest of the app already expects (configured/flagged/severe/flaggedCategories),
   so nothing outside this file needs to know the underlying AI changed. */
function classifyAnalysis(categoriesAnalysis) {
  const categories = {};
  const flaggedCategories = [];
  let severe = false;
  let flagged = false;

  categoriesAnalysis.forEach(({ category, severity }) => {
    categories[category] = severity;
    const severeAt = SEVERE_THRESHOLDS[category] ?? 6;

    if (severity >= severeAt) {
      severe = true;
      flagged = true;
      flaggedCategories.push(`${category} (severe)`);
    } else if (severity >= SOFT_THRESHOLD) {
      flagged = true;
      flaggedCategories.push(category);
    }
  });

  return { configured: true, flagged, severe, categories, flaggedCategories };
}

/* Checks free text (a task/listing/event's title + description). Fails
   OPEN on any problem — missing config, network error, bad response —
   rather than blocking content creation over a moderation outage. */
async function evaluateText(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { ...EMPTY_RESULT, configured: isConfigured() };

  /* Local keyword backstop runs first, regardless of whether the AI is
     configured or reachable — this is the layer that's still supposed to
     catch things even when Azure is down or misses something itself. A
     severe hit (an unambiguous phrase like "commit suicide") short-
     circuits straight to a hard block without bothering to call the AI. A
     soft hit (an ambiguous bare word like "kill") still gets combined with
     whatever the AI finds below, rather than deciding alone. */
  const keywordHit = checkHardBlockKeywords(trimmed);
  const keywordResult = keywordHit.flagged
    ? { configured: isConfigured(), flagged: true, severe: false, categories: {}, flaggedCategories: [`keyword:${keywordHit.matchedPhrase}`] }
    : null;

  if (keywordHit.severe) {
    return { ...keywordResult, severe: true };
  }

  if (!isConfigured()) {
    warnDisabledOnce();
    return keywordResult || EMPTY_RESULT;
  }

  try {
    const analysis = await callContentSafety("text", {
      text: trimmed,
      categories: CATEGORIES,
      outputType: "FourSeverityLevels"
    });
    const aiResult = classifyAnalysis(analysis);
    if (!keywordResult) return aiResult;

    return {
      ...aiResult,
      flagged: true,
      flaggedCategories: Array.from(new Set([...aiResult.flaggedCategories, ...keywordResult.flaggedCategories]))
    };
  } catch (error) {
    console.error("[moderation] Text moderation check failed, allowing content through:", error.message);
    return keywordResult || EMPTY_RESULT;
  }
}

/* Checks a single image, given a base64 data URI (e.g.
   `data:image/jpeg;base64,<...>`) or already-raw base64. Azure's image
   endpoint wants the raw base64 payload with no data-URI prefix and has no
   hosted-URL-by-fetch option here (only inline content or a blob storage
   URL it already has access to), so the prefix is stripped if present.
   Same fail-open behavior as evaluateText. */
async function evaluateImage(imageDataUriOrBase64) {
  if (!isConfigured()) {
    warnDisabledOnce();
    return EMPTY_RESULT;
  }

  try {
    const base64Content = String(imageDataUriOrBase64).replace(/^data:.*;base64,/, "");
    const analysis = await callContentSafety("image", {
      image: { content: base64Content },
      categories: CATEGORIES,
      outputType: "FourSeverityLevels"
    });
    return classifyAnalysis(analysis);
  } catch (error) {
    console.error("[moderation] Image moderation check failed, allowing upload through:", error.message);
    return EMPTY_RESULT;
  }
}

/* Images are moderated once, at upload time (see upload.controller.js),
   before they're attached to any task/sales item/equipment listing/event —
   at that point there's no listing yet to mark. A severe image is rejected
   right there and never gets a URL at all. A soft-flagged image is still
   uploaded so the flow doesn't break, but its URL is recorded here so that
   whichever listing ends up using it can be marked pending_review too,
   without re-moderating the same image a second time. */
async function recordFlaggedUpload(imageUrl, flaggedCategories) {
  await pool.execute(
    `INSERT INTO flagged_uploads (image_url, flagged_categories) VALUES (?, ?)`,
    [imageUrl, flaggedCategories.length ? JSON.stringify(flaggedCategories) : null]
  );
}

async function checkPreviouslyFlaggedImages(imageUrls = []) {
  if (!imageUrls.length) return { flagged: false, flaggedCategories: [] };

  const [rows] = await pool.query(
    `SELECT image_url, flagged_categories FROM flagged_uploads WHERE image_url IN (?)`,
    [imageUrls]
  );

  if (!rows.length) return { flagged: false, flaggedCategories: [] };

  const flaggedCategories = new Set();
  rows.forEach(row => {
    let categories = [];
    try { categories = row.flagged_categories ? JSON.parse(row.flagged_categories) : []; } catch { categories = []; }
    categories.forEach(cat => flaggedCategories.add(cat));
  });

  return { flagged: true, flaggedCategories: Array.from(flaggedCategories) };
}

/* Combines a text check on title+description with a lookup of any
   already-flagged images among imageUrls. A flagged_uploads match here
   only ever contributes a soft flag — severe images never reach this
   point, since they're rejected at upload time and never get a URL. */
async function evaluateListingContent({ title, description, imageUrls = [] }) {
  const textResult = await evaluateText(`${title || ""}\n\n${description || ""}`);
  const imageResult = await checkPreviouslyFlaggedImages(imageUrls);

  return {
    configured: textResult.configured,
    severe: textResult.severe,
    flagged: textResult.flagged || imageResult.flagged,
    flaggedCategories: Array.from(new Set([...textResult.flaggedCategories, ...imageResult.flaggedCategories]))
  };
}

module.exports = {
  evaluateText,
  evaluateImage,
  evaluateListingContent,
  recordFlaggedUpload,
  checkHardBlockKeywords,
  SEVERE_THRESHOLDS,
  SOFT_THRESHOLD,
  HARD_BLOCK_PHRASES
};
