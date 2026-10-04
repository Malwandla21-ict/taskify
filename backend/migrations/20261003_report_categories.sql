-- Report categories (2026-10-03, panel feedback)
-- Doc copy of what backend/scripts/repair-report-categories-schema.js applies.
-- Run the script instead of this file directly — it's idempotent and safe
-- to re-run; this .sql is kept only as a readable record.
--
-- Reports are problems sent to admins. Reviews (star ratings) live in the
-- separate `reviews` table and are not touched here.

ALTER TABLE reports
  ADD COLUMN category ENUM('payment','damaged_item','not_as_described','no_show',
                           'scam','harassment','inappropriate','other')
    NOT NULL DEFAULT 'other' AFTER reason;

ALTER TABLE reports
  MODIFY COLUMN context_type ENUM('task','equipment','equipment_booking','sales_item','event') NULL;

-- Flagged chat messages are abusive-message reports
UPDATE reports SET category = 'harassment'
WHERE message_id IS NOT NULL AND category = 'other';

-- Rentals already marked Damaged by the owner get a matching report row
INSERT INTO reports (reporter_id, reported_user_id, context_type, context_id, reason, category, status)
SELECT e.owner_id, eb.renter_id, 'equipment_booking', eb.id,
       COALESCE(NULLIF(eb.damage_note, ''), 'Item came back damaged.'),
       'damaged_item', 'Pending'
FROM equipment_bookings eb
INNER JOIN equipment e ON eb.equipment_id = e.id
WHERE eb.condition_status = 'Damaged'
  AND NOT EXISTS (
    SELECT 1 FROM reports r
    WHERE r.context_type = 'equipment_booking' AND r.context_id = eb.id AND r.category = 'damaged_item'
  );
