/*
  Image-side sanity check for the Azure Content Safety integration.
  Everything else so far (test-azure-moderation.js, -raw.js) only tested
  text — this exercises evaluateImage() end-to-end against Azure's
  image:analyze endpoint, the same code path upload.controller.js uses for
  every task/sales/equipment/event photo.

  The embedded image below is a plain solid-color 64x64 JPEG generated
  locally for this test (Azure's image endpoint requires at least 50x50
  pixels) — it's not meant to trigger any category, just to prove the
  request/response plumbing works: right content-type, right auth header,
  a 200 back, and a real categoriesAnalysis array parsed correctly. That's
  a mechanical check, not an accuracy check — Azure's own published
  category definitions are the source of truth for how well it actually
  detects real violating images, which isn't something to test with
  manufactured harmful content.

  Usage (from the backend/ folder):
    node scripts/test-azure-moderation-image.js
*/

require("dotenv").config();
const { evaluateImage } = require("../src/services/contentModeration.service");

// A tiny solid-color JPEG (64x64, plain blue-grey square) — harmless test fixture.
const TEST_IMAGE_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCABAAEADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDtaKKK+1PkQooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//Z";

(async () => {
  console.log("=== Azure Content Safety — image sanity check ===");
  console.log("AZURE_CONTENT_SAFETY_ENDPOINT:", process.env.AZURE_CONTENT_SAFETY_ENDPOINT || "(not set)");
  console.log("AZURE_CONTENT_SAFETY_KEY present:", Boolean(process.env.AZURE_CONTENT_SAFETY_KEY));
  console.log("");

  const dataUri = `data:image/jpeg;base64,${TEST_IMAGE_BASE64}`;
  const result = await evaluateImage(dataUri);
  console.log(JSON.stringify(result, null, 2));

  console.log("");
  if (result.configured && Object.keys(result.categories).length === 4) {
    console.log("Looks correct: all four categories came back with real severity numbers — the image pipeline (upload.controller.js's exact code path) is wired up and reaching Azure successfully.");
  } else if (!result.configured) {
    console.log("configured=false — the endpoint/key aren't loading. Same checks as the text script: .env formatting, and that you restarted after editing it.");
  } else {
    console.log("Something looks off — expected all four categories (Hate/SelfHarm/Sexual/Violence) with real severity numbers. If you saw a '[moderation] Image moderation check failed...' line above, that's the actual Azure error, printed verbatim.");
  }
})();
