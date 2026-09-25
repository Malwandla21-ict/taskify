const notificationService = require("./notification.service");

/*
  Closing the open offers on a listing once it's no longer up for grabs
  (task assigned / cancelled / deleted, sales item reserved / sold /
  deleted). Kept in its own small file because task.service, sales.service
  and offer.service all need it — offer.service already requires the
  other two, so putting this in any of them would make them require each
  other in a circle.

  If the offers table doesn't exist yet (the new code was deployed before
  `node scripts/repair-negotiation-schema.js` was run), these quietly do
  nothing instead of breaking task accepts and sales. A missing-table
  error in MySQL/MariaDB only fails that one statement, not the whole
  transaction, so catching it here is safe.
*/
const NO_SUCH_TABLE = 1146;

function offersTableMissing(error) {
  if (error && error.errno === NO_SUCH_TABLE) {
    console.warn("[offers] offers table missing — run scripts/repair-negotiation-schema.js. Skipping offer clean-up.");
    return true;
  }
  return false;
}

/* Must run inside the caller's transaction, after the listing row is
   locked. winnerId (optional) is the person who just got the listing —
   their own open offer is marked Withdrawn (they took it another way)
   instead of Declined, and they aren't told they "lost".
   Returns the declined offers so the caller can notify those people
   AFTER committing. */
async function closeOpenOffers(connection, contextType, contextId, { winnerId = null } = {}) {
  try {
    await connection.execute(
      `UPDATE offers SET status = 'Expired'
       WHERE context_type = ? AND context_id = ? AND status = 'Pending' AND expires_at <= NOW()`,
      [contextType, contextId]
    );

    const [rows] = await connection.execute(
      `SELECT id, offerer_id FROM offers
       WHERE context_type = ? AND context_id = ? AND status = 'Pending'
       FOR UPDATE`,
      [contextType, contextId]
    );
    if (!rows.length) return [];

    const declined = [];
    for (const row of rows) {
      const isWinner = winnerId != null && Number(row.offerer_id) === Number(winnerId);
      await connection.execute(
        `UPDATE offers SET status = ? WHERE id = ?`,
        [isWinner ? "Withdrawn" : "Declined", row.id]
      );
      if (!isWinner) declined.push(row);
    }
    return declined;
  } catch (error) {
    if (offersTableMissing(error)) return [];
    throw error;
  }
}

/* Call after commit. `reason` finishes the sentence
   'Your offer on "X" was closed because ...'. */
async function notifyClosedOffers(closedOffers, { contextType, contextId, title, reason }) {
  const notificationContext = contextType === "sales_item" ? "sales_item" : "task";
  for (const offer of closedOffers) {
    await notificationService.createNotification({
      userId: offer.offerer_id,
      title: "Offer Closed",
      message: `Your offer on "${title}" was closed because ${reason}.`,
      contextType: notificationContext,
      contextId
    });
  }
}

/* For deleting a listing: its offers (and, through the foreign key,
   their history) go with it. */
async function deleteOffersFor(executor, contextType, contextId) {
  try {
    await executor.execute(
      `DELETE FROM offers WHERE context_type = ? AND context_id = ?`,
      [contextType, contextId]
    );
  } catch (error) {
    if (!offersTableMissing(error)) throw error;
  }
}

module.exports = { closeOpenOffers, notifyClosedOffers, deleteOffersFor };
