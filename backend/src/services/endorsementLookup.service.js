const pool = require("../config/db");

/*
  Attaches "latest endorsement" fields to a list of items (tasks, events,
  equipment, or sales items) via a simple batched lookup instead of a SQL
  JOIN. This sidesteps JOIN/subquery interaction risk entirely — one extra
  query per list load, filtered to only the ids actually being displayed,
  with "pick the latest per item" done in plain JS.
*/
async function attachLatestEndorsements(items, contextType) {
  if (!items.length) return items;

  const ids = items.map(i => i.id);
  const placeholders = ids.map(() => "?").join(",");

  const [rows] = await pool.query(
    `SELECT
       le.context_id, le.endorsement_type, le.message, le.created_at,
       lecturer.id AS lecturer_id, lecturer.full_name AS lecturer_name,
       lecturer.lecturer_title, lecturer.profile_photo_url AS lecturer_photo
     FROM lecturer_endorsements le
     INNER JOIN users lecturer ON le.lecturer_id = lecturer.id
     WHERE le.context_type = ? AND le.context_id IN (${placeholders})
     ORDER BY le.created_at DESC`,
    [contextType, ...ids]
  );

  const latestByContextId = new Map();
  for (const row of rows) {
    if (!latestByContextId.has(row.context_id)) {
      latestByContextId.set(row.context_id, row);
    }
  }

  return items.map(item => {
    const endorsement = latestByContextId.get(item.id);
    if (!endorsement) return item;
    return {
      ...item,
      endorsement_type: endorsement.endorsement_type,
      endorsement_message: endorsement.message,
      endorsed_by_lecturer_id: endorsement.lecturer_id,
      endorsed_by_lecturer_name: endorsement.lecturer_name,
      endorsed_by_lecturer_title: endorsement.lecturer_title,
      endorsed_by_lecturer_photo: endorsement.lecturer_photo
    };
  });
}

async function attachLatestEndorsement(item, contextType) {
  if (!item) return item;
  const [result] = await attachLatestEndorsements([item], contextType);
  return result;
}

module.exports = { attachLatestEndorsements, attachLatestEndorsement };