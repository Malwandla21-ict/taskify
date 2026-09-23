const pool = require("../config/db");
const {
  RENTAL_TRUST_LEVELS,
  RENTAL_PROTECTION_FEE
} = require("../config/paymentSettings");

/*
  Renter trust ladder + rental price quote (DEMO — see paymentSettings.js).

  A renter's level comes only from their own rental record:
    goodRentals   — bookings they rented that reached 'Returned' and the
                    owner did NOT report damage on
    damageReports — bookings where the owner reported damage
    rating        — users.rating_average, only counted once they have at
                    least one review (a brand-new account with 0 reviews
                    isn't punished for having no rating yet)
*/

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

async function getRenterStats(userId) {
  const [bookingRows] = await pool.execute(
    `SELECT
       SUM(CASE WHEN status = 'Returned'
                 AND (condition_status IS NULL OR condition_status <> 'Damaged')
                THEN 1 ELSE 0 END) AS good_rentals,
       SUM(CASE WHEN condition_status = 'Damaged' THEN 1 ELSE 0 END) AS damage_reports
     FROM equipment_bookings
     WHERE renter_id = ?`,
    [userId]
  );
  const [userRows] = await pool.execute(
    `SELECT rating_average, total_reviews FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );

  return {
    goodRentals:   Number(bookingRows[0]?.good_rentals || 0),
    damageReports: Number(bookingRows[0]?.damage_reports || 0),
    rating:        Number(userRows[0]?.rating_average || 0),
    totalReviews:  Number(userRows[0]?.total_reviews || 0)
  };
}

function meetsLevel(level, stats) {
  if (stats.goodRentals < level.minGoodRentals) return false;
  if (level.requireNoDamage && stats.damageReports > 0) return false;
  if (stats.totalReviews > 0 && stats.rating < level.minRating) return false;
  return true;
}

/* Plain-language "how do I get to the next level" hint for the UI. */
function describeNextLevel(currentKey, stats) {
  const index = RENTAL_TRUST_LEVELS.findIndex(l => l.key === currentKey);
  if (index <= 0) return null; // already the top level
  const next = RENTAL_TRUST_LEVELS[index - 1];

  const needs = [];
  const rentalsNeeded = Math.max(0, next.minGoodRentals - stats.goodRentals);
  if (rentalsNeeded > 0) needs.push(`${rentalsNeeded} more good rental${rentalsNeeded === 1 ? "" : "s"}`);
  if (stats.totalReviews > 0 && stats.rating < next.minRating) needs.push(`a rating of ${next.minRating.toFixed(1)}+`);
  if (next.requireNoDamage && stats.damageReports > 0) needs.push("no damage reports on your record");

  return {
    key: next.key,
    label: next.label,
    rentalsNeeded,
    hint: needs.length ? `To reach ${next.label}: ${needs.join(", ")}.` : null
  };
}

async function getRenterTrust(userId) {
  const stats = await getRenterStats(userId);
  const level = RENTAL_TRUST_LEVELS.find(l => meetsLevel(l, stats))
    || RENTAL_TRUST_LEVELS[RENTAL_TRUST_LEVELS.length - 1];

  return {
    level: level.key,
    label: level.label,
    depositPercent: level.depositPercent,
    maxItemValue: level.maxItemValue,
    ...stats,
    next: describeNextLevel(level.key, stats)
  };
}

/* Whole days between two YYYY-MM-DD dates, counting both ends (a same-day
   rental is 1 day). Parsed as UTC so the server's timezone can't shift it. */
function countRentalDays(startDate, endDate) {
  const toUtc = value => {
    const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const days = Math.round((toUtc(endDate) - toUtc(startDate)) / 86400000) + 1;
  return Number.isFinite(days) ? days : NaN;
}

function calculateProtectionFee(rentalAmount) {
  const { percent, min, max } = RENTAL_PROTECTION_FEE;
  const raw = rentalAmount * (percent / 100);
  return roundMoney(Math.min(max, Math.max(min, raw)));
}

/*
  Builds the full money breakdown for one renter + one item + dates.
  `allowed` is false (with a reason) when the item is worth more than the
  renter's level may rent. Items listed before item_value existed have no
  value (null): no cap and no deposit can be worked out for them, so the
  quote says so honestly instead of inventing a value.
*/
async function buildRentalQuote({ renterId, equipment, startDate, endDate }) {
  const trust = await getRenterTrust(renterId);
  const days = countRentalDays(startDate, endDate);
  const dailyPrice = Number(equipment.daily_price);
  const itemValue = equipment.item_value == null ? null : Number(equipment.item_value);

  const rentalAmount = roundMoney(dailyPrice * (days > 0 ? days : 0));
  const protectionFee = days > 0 ? calculateProtectionFee(rentalAmount) : 0;
  const depositAmount = itemValue == null ? 0 : roundMoney(itemValue * (trust.depositPercent / 100));

  let allowed = true;
  let reason = null;
  if (!(days > 0)) {
    allowed = false;
    reason = "End date cannot be before start date.";
  } else if (itemValue != null && trust.maxItemValue != null && itemValue > trust.maxItemValue) {
    allowed = false;
    reason = `This item is worth R${itemValue.toFixed(2)}. As a "${trust.label}" renter you can rent items worth up to R${Number(trust.maxItemValue).toFixed(2)}.` +
      (trust.next?.hint ? ` ${trust.next.hint}` : "");
  }

  return {
    demo: true,
    trust,
    days: days > 0 ? days : 0,
    dailyPrice,
    itemValue,
    itemValueMissing: itemValue == null,
    rentalAmount,
    protectionFee,
    depositAmount,
    totalToHold: roundMoney(rentalAmount + protectionFee + depositAmount),
    allowed,
    reason
  };
}

module.exports = {
  getRenterTrust,
  buildRentalQuote,
  countRentalDays,
  roundMoney
};
