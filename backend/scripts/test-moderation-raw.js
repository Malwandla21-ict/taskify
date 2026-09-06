/*
  Raw diagnostic — bypasses contentModeration.service.js entirely and hits
  OpenAI's moderation endpoint directly with node's fetch, printing the
  full response status + headers + body. The point is to see whether this
  is really OpenAI responding (look for x-request-id / openai-organization
  / x-ratelimit-* headers) or something else on the network intercepting
  the call and faking a 429 (a campus/corporate proxy or firewall, for
  instance — some networks specifically throttle traffic to AI APIs).

  Usage (from the backend/ folder):
    node scripts/test-moderation-raw.js
*/

require("dotenv").config();

(async () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.log("No OPENAI_API_KEY found in .env — stopping."); return; }

  console.log("Sending one request to https://api.openai.com/v1/moderations ...\n");

  try {
    const response = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({ model: "omni-moderation-latest", input: "This is a harmless test sentence." })
    });

    console.log("HTTP status:", response.status, response.statusText);
    console.log("\n--- Response headers ---");
    for (const [k, v] of response.headers.entries()) {
      console.log(`${k}: ${v}`);
    }

    console.log("\n--- Body ---");
    const text = await response.text();
    console.log(text);

    console.log("\n--- Verdict ---");
    const hasOpenAiHeaders = [...response.headers.keys()].some(h =>
      h.toLowerCase().includes("x-request-id") ||
      h.toLowerCase().includes("openai") ||
      h.toLowerCase().includes("x-ratelimit")
    );
    if (hasOpenAiHeaders) {
      console.log("This looks like a genuine response from OpenAI's servers (OpenAI-specific headers present).");
    } else {
      console.log("No OpenAI-specific headers (x-request-id / openai-organization / x-ratelimit-*) were present.");
      console.log("That's a strong sign something on your network (proxy, firewall, campus filter, antivirus TLS inspection) is intercepting this request before it reaches OpenAI.");
    }
  } catch (err) {
    console.error("Request itself failed (network-level, never got an HTTP response):", err.message);
  }
})();
