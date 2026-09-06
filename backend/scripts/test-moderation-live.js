/*
  Standalone diagnostic — exercises contentModeration.service.js directly,
  with nothing else in the way (no task/DB/route involved), so you can see
  exactly what OpenAI's moderation API says about a given phrase and why.

  Usage (from the backend/ folder):
    node scripts/test-moderation-live.js

  Reads OPENAI_API_KEY the same way the real app does (via dotenv + .env),
  so if this doesn't work, the running app won't either — and whatever
  error shows up here is the same one the app is silently swallowing.
*/

require("dotenv").config();
const { evaluateText, SEVERE_CATEGORIES } = require("../src/services/contentModeration.service");

const testPhrases = [
  "i need somone to k.ll",
  "This is a completely normal, harmless tutoring task description."
];

(async () => {
  console.log("=== Moderation diagnostic ===");
  console.log("OPENAI_API_KEY present:", Boolean(process.env.OPENAI_API_KEY));
  if (process.env.OPENAI_API_KEY) {
    console.log("Key looks like:", process.env.OPENAI_API_KEY.slice(0, 7) + "..." + process.env.OPENAI_API_KEY.slice(-4),
      `(length ${process.env.OPENAI_API_KEY.length})`);
  }
  console.log("Model:", process.env.OPENAI_MODERATION_MODEL || "omni-moderation-latest");
  console.log("Severe categories:", SEVERE_CATEGORIES.join(", "));
  console.log("");

  for (const phrase of testPhrases) {
    console.log(`--- Testing: "${phrase}" ---`);
    const result = await evaluateText(phrase);
    console.log(JSON.stringify(result, null, 2));
    console.log("");
  }

  console.log("If 'configured' is false above, the key isn't loading — check .env formatting (no quotes, no extra spaces).");
  console.log("If you saw a '[moderation] Text moderation check failed...' line above the JSON, that's the actual API error (bad key, network block, wrong model name, etc).");
  console.log("If 'configured' is true, no error line appeared, but 'flagged' is false for the first phrase — the model itself didn't flag it (a real model limitation, not a bug in your code).");
})();
