const { CONTACT_MASK_TEXT } = require("../config/paymentSettings");

/*
  Finds contact details in free text (chat messages, offer notes) so people
  can't swap numbers and take the deal outside Taskify before any money is
  held. Only the masked text is ever stored.

  Catches:
    - South African phone numbers: 0821234567, 082 123 4567, 082-123-4567,
      (082) 123 4567, +27 82 123 4567, 27821234567
    - email addresses
    - WhatsApp links (wa.me/..., api.whatsapp.com/..., chat.whatsapp.com/...)
    - the words "whatsapp" / "whats app" and the phrase "call me on"

  It's a speed bump, not a guarantee — someone determined can still write
  "zero eight two..." — but it stops the easy copy-paste swap.
*/
const PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?wa\.me\/\S*/gi,
  /(?:https?:\/\/)?(?:api|chat)\.whatsapp\.com\/\S*/gi,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /(?<!\d)\(?(?:\+?27|0)[\s.-]?\(?\d{2}\)?(?:[\s.-]?\d){7}(?!\d)/g,
  /\bwhats\s?app\b/gi,
  /\bcall me on\b/gi
];

function maskContactDetails(text) {
  let masked = String(text ?? "");
  let found = false;
  for (const pattern of PATTERNS) {
    masked = masked.replace(pattern, () => {
      found = true;
      return CONTACT_MASK_TEXT;
    });
  }
  return { text: masked, masked: found };
}

module.exports = { maskContactDetails };
