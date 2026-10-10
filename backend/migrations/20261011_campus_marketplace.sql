-- Campus Marketplace (2026-10-11)
-- Doc copy of what backend/scripts/repair-marketplace-authority-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.

-- "Events" becomes Campus Marketplace (same table). New posts use the
-- marketplace categories in config/categories.js; institutional ones (farm
-- produce, surplus, lost property, departmental) record who authorised them
-- and are held for an admin check before they appear.
ALTER TABLE events ADD COLUMN listing_authority VARCHAR(300) NULL DEFAULT NULL;
