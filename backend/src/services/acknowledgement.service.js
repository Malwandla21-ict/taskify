const pool = require("../config/db");
const { ACKNOWLEDGEMENTS } = require("../config/acknowledgements");

/*
  Records that someone ticked a "read and agree" box (config/
  acknowledgements.js): who, which text, which version, when, and for
  which listing or booking. This is the evidence behind "you were told":
  admins can see it when a dispute or report comes in.

  Recording happens after the listing/booking itself is saved. If the
  table doesn't exist yet (backend deployed before
  scripts/repair-acknowledgements-schema.js was run) it logs a warning
  instead of failing the post — the tick was still required by the
  middleware, it just isn't stored.
*/
const NO_SUCH_TABLE = 1146;

/* `given` is the request's { kind: version } object. Returns the first
   problem as a sentence, or null when every required kind is ticked at
   the current version. */
function checkAcknowledgements(given, kinds) {
  const ticked = given && typeof given === "object" && !Array.isArray(given) ? given : {};
  for (const kind of kinds) {
    const ack = ACKNOWLEDGEMENTS[kind];
    if (!ack) continue;
    if (!ticked[kind]) return `Please read "${ack.title}" and tick the box to confirm.`;
    if (String(ticked[kind]) !== ack.version) {
      return `"${ack.title}" was just updated. Please read it again and tick the box.`;
    }
  }
  return null;
}

async function recordAcknowledgements(userId, kinds, contextType, contextId) {
  if (!kinds.length) return;
  try {
    for (const kind of kinds) {
      const ack = ACKNOWLEDGEMENTS[kind];
      if (!ack) continue;
      await pool.execute(
        `INSERT INTO user_acknowledgements (user_id, kind, version, context_type, context_id)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, kind, ack.version, contextType, contextId]
      );
    }
  } catch (error) {
    if (error && error.errno === NO_SUCH_TABLE) {
      console.warn("[acknowledgements] user_acknowledgements table missing — run scripts/repair-acknowledgements-schema.js. Not recorded.");
      return;
    }
    throw error;
  }
}

/* For admins: what this person agreed to, newest first. */
async function getAcknowledgementsForUser(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT kind, version, context_type, context_id, created_at
       FROM user_acknowledgements WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 200`,
      [userId]
    );
    return rows.map(row => ({ ...row, title: ACKNOWLEDGEMENTS[row.kind]?.title || row.kind }));
  } catch (error) {
    if (error && error.errno === NO_SUCH_TABLE) return [];
    throw error;
  }
}

module.exports = { checkAcknowledgements, recordAcknowledgements, getAcknowledgementsForUser };
