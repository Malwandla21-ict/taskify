const pool = require("../config/db");
const { RENTAL_PROTECTION_FUND } = require("../config/paymentSettings");

/*
  The Taskify Protection Fund (DEMO — no real money moves; see
  config/paymentSettings.js).

  Renters pay a small protection fee instead of a big deposit. When a
  rental completes, that fee goes into the fund. When an admin confirms
  damage, or that an item was never returned, they can pay the owner out
  of the fund. The renter is never charged for it.

  Every movement is a row in protection_fund_entries: 'fee' rows are
  positive, 'payout' rows negative, so the balance is the opening balance
  plus the sum of every row. The table's UNIQUE (booking_id, kind) key
  means a booking adds its fee once and is paid out at most once.
*/

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function badRequest(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getBalance(connection = pool) {
  const [rows] = await connection.execute(`SELECT COALESCE(SUM(amount), 0) AS total FROM protection_fund_entries`);
  return roundMoney(RENTAL_PROTECTION_FUND.openingBalance + Number(rows[0].total));
}

/* The most one claim on this item can pay: the smallest of the per-claim
   cap, the item's listed value (when known) and what's in the fund. */
function payoutLimit({ itemValue = null, balance }) {
  const limits = [RENTAL_PROTECTION_FUND.maxPayoutPerClaim, Math.max(0, balance)];
  if (itemValue != null && Number(itemValue) > 0) limits.push(Number(itemValue));
  return roundMoney(Math.min(...limits));
}

/* A rental's protection fee goes into the fund when the rental completes
   (the rent is released). Call inside the same transaction. A second call
   for the same booking does nothing. */
async function addRentalFee(connection, bookingId) {
  await connection.execute(
    `INSERT IGNORE INTO protection_fund_entries (kind, amount, booking_id)
     SELECT 'fee', protection_fee, id FROM equipment_bookings
     WHERE id = ? AND protection_fee > 0`,
    [bookingId]
  );
}

/*
  Runs `work(connection)` inside a transaction while holding the fund's
  lock, so two admins paying claims at the same moment can't both spend
  the same money. `work` gets the connection and must do every write
  through it.
*/
async function withFundLock(work) {
  const connection = await pool.getConnection();
  let locked = false;
  try {
    const [lock] = await connection.query(`SELECT GET_LOCK('taskify_protection_fund', 10) AS ok`);
    locked = Number(lock[0].ok) === 1;
    if (!locked) throw badRequest("The protection fund is busy. Please try again in a moment.", 503);
    await connection.beginTransaction();
    try {
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    if (locked) await connection.query(`SELECT RELEASE_LOCK('taskify_protection_fund')`).catch(() => {});
    connection.release();
  }
}

/*
  Pays the owner `amount` from the fund for this booking. Call inside
  withFundLock. Refuses an amount above the limit for this item rather
  than quietly paying less — the admin should know what was paid.
  Returns the amount paid (0 when amount is 0 or empty: no payout).
*/
async function payOwner(connection, { bookingId, ownerId, itemValue, amount, reason, adminId, note = null }) {
  const requested = roundMoney(amount || 0);
  if (!(requested > 0)) return 0;

  const limit = payoutLimit({ itemValue, balance: await getBalance(connection) });
  if (requested > limit) {
    throw badRequest(`The fund can pay at most R${limit.toFixed(2)} for this rental (the limit is R${RENTAL_PROTECTION_FUND.maxPayoutPerClaim.toFixed(2)} per claim, never more than the item's value or what's in the fund).`);
  }

  try {
    await connection.execute(
      `INSERT INTO protection_fund_entries (kind, amount, booking_id, owner_id, admin_id, reason, note)
       VALUES ('payout', ?, ?, ?, ?, ?, ?)`,
      [-requested, bookingId, ownerId, adminId, reason, note ? String(note).slice(0, 500) : null]
    );
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw badRequest("The owner has already been paid from the fund for this rental.");
    throw error;
  }
  return requested;
}

/* For the admin screens: where the fund stands. */
async function getSummary() {
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'fee' THEN amount ELSE 0 END), 0) AS fees_in,
       COALESCE(SUM(CASE WHEN kind = 'payout' THEN -amount ELSE 0 END), 0) AS paid_out,
       SUM(kind = 'payout') AS payouts
     FROM protection_fund_entries`
  );
  const feesIn = roundMoney(rows[0].fees_in);
  const paidOut = roundMoney(rows[0].paid_out);
  return {
    demo: true,
    openingBalance: RENTAL_PROTECTION_FUND.openingBalance,
    feesIn,
    paidOut,
    payouts: Number(rows[0].payouts || 0),
    balance: roundMoney(RENTAL_PROTECTION_FUND.openingBalance + feesIn - paidOut),
    maxPayoutPerClaim: RENTAL_PROTECTION_FUND.maxPayoutPerClaim
  };
}

module.exports = {
  getBalance,
  payoutLimit,
  addRentalFee,
  withFundLock,
  payOwner,
  getSummary
};
