/*
  Raw diagnostic — bypasses contentModeration.service.js entirely and hits
  Azure Content Safety's text:analyze endpoint directly, printing the full
  response status + body exactly as Azure sends it. Use this when the
  parsed results look wrong (e.g. everything scoring 0) to rule out a
  parsing bug versus something about the Azure resource itself.

  Usage (from the backend/ folder):
    node scripts/test-azure-moderation-raw.js
*/

require("dotenv").config();

(async () => {
  const endpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
  const key = process.env.AZURE_CONTENT_SAFETY_KEY;
  if (!endpoint || !key) { console.log("Missing AZURE_CONTENT_SAFETY_ENDPOINT or AZURE_CONTENT_SAFETY_KEY in .env."); return; }

  const base = endpoint.replace(/\/+$/, "");
  const apiVersion = process.env.AZURE_CONTENT_SAFETY_API_VERSION || "2024-09-01";
  const url = `${base}/contentsafety/text:analyze?api-version=${apiVersion}`;

  console.log("POST", url);
  console.log("");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": key
      },
      body: JSON.stringify({
        text: "I hate you",
        categories: ["Hate", "SelfHarm", "Sexual", "Violence"],
        outputType: "FourSeverityLevels"
      })
    });

    console.log("HTTP status:", response.status, response.statusText);
    console.log("\n--- Response headers ---");
    for (const [k, v] of response.headers.entries()) console.log(`${k}: ${v}`);

    console.log("\n--- Body (raw) ---");
    const text = await response.text();
    console.log(text);

    console.log("\n--- Expected (per Microsoft's own quickstart docs) ---");
    console.log('Hate severity should be 2, others 0 for the input "I hate you".');
    console.log("If Hate is 0 here too, something about this specific resource/region/API version combo isn't scoring properly — worth trying a different Azure region when recreating the resource, or checking the resource's kind is exactly \"Content Safety\" (not a generic multi-service \"Azure AI services\" resource, which can behave differently for this endpoint).");
  } catch (err) {
    console.error("Request itself failed:", err.message);
  }
})();
