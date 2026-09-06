/*
  Standalone diagnostic for the Azure AI Content Safety integration —
  exercises contentModeration.service.js directly, with nothing else in
  the way (no task/DB/route involved), so you can see exactly what Azure
  says about a given phrase and why.

  Usage (from the backend/ folder):
    node scripts/test-azure-moderation.js

  Reads AZURE_CONTENT_SAFETY_ENDPOINT / AZURE_CONTENT_SAFETY_KEY the same
  way the real app does (via dotenv + .env), so if this doesn't work, the
  running app won't either — and whatever error shows up here is the same
  one the app is silently swallowing (it fails open on purpose).
*/

require("dotenv").config();
const { evaluateText, SEVERE_THRESHOLDS, SOFT_THRESHOLD } = require("../src/services/contentModeration.service");

const testPhrases = [
  "i need somone to k.ll",
  "i need someone to kill someone",
  "This is a completely normal, harmless tutoring task description.",
  /* Microsoft's own quickstart docs use this exact phrase as a documented
     example and show it scoring Hate: 2 — a sanity check on the
     integration/resource itself, independent of anything about the app. */
  "I hate you"
];

(async () => {
  console.log("=== Azure Content Safety diagnostic ===");
  console.log("AZURE_CONTENT_SAFETY_ENDPOINT:", process.env.AZURE_CONTENT_SAFETY_ENDPOINT || "(not set)");
  console.log("AZURE_CONTENT_SAFETY_KEY present:", Boolean(process.env.AZURE_CONTENT_SAFETY_KEY));
  console.log("Severe thresholds (severity >= this hard-blocks):", JSON.stringify(SEVERE_THRESHOLDS));
  console.log("Soft-flag threshold (severity >= this queues for review):", SOFT_THRESHOLD);
  console.log("");

  for (const phrase of testPhrases) {
    console.log(`--- Testing: "${phrase}" ---`);
    const result = await evaluateText(phrase);
    console.log(JSON.stringify(result, null, 2));
    console.log("");
  }

  console.log("If 'configured' is false above, the endpoint/key aren't loading — check .env formatting (no quotes, no extra spaces) and that you restarted after editing it.");
  console.log("If you saw a '[moderation] Text moderation check failed...' line above the JSON, that's the actual Azure API error, printed verbatim.");
  console.log("If 'configured' is true, no error line appeared, and 'categories' shows real severity numbers, the integration is working — check the numbers against SEVERE_THRESHOLDS to see why something did/didn't block.");
})();
