-- Selling more than one of the same item (2026-10-12)
-- Doc copy of what backend/scripts/repair-sale-quantity-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.

-- quantity: how many the seller has (1 = a single item, which leaves the
-- marketplace as soon as it sells). quantity_sold: how many have gone.
ALTER TABLE sales_items ADD COLUMN quantity INT NOT NULL DEFAULT 1;
ALTER TABLE sales_items ADD COLUMN quantity_sold INT NOT NULL DEFAULT 0;
UPDATE sales_items SET quantity_sold = quantity WHERE status = 'Sold';
