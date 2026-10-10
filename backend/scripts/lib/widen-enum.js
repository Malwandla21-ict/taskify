/*
  Adds values to an ENUM column without ever removing any.

  Several features each needed one more value in the same column (for
  example reports.context_type gained 'event', then 'equipment'). If each
  repair script wrote out its own fixed ENUM(...) list, running an older
  script after a newer one would quietly shrink the list again, and any
  row holding a removed value would fail to save or be blanked.

  This reads the column's current values, keeps all of them in their
  current order, appends only the ones that are missing, and does nothing
  at all when every value is already there.

  `rest` is the part after the type, e.g. "NULL" or
  "NOT NULL DEFAULT 'Student'", so the column keeps its nullability and
  default.
*/
async function widenEnum(pool, table, column, values, rest) {
  const [rows] = await pool.execute(
    `SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (!rows.length) throw new Error(`${table}.${column} not found.`);

  const current = [...String(rows[0].type).matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
  const missing = values.filter((v) => !current.includes(v));
  if (!missing.length) {
    console.log(`${table}.${column} already has ${values.map((v) => `'${v}'`).join(", ")} — skipping.`);
    return false;
  }

  const list = [...current, ...missing].map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
  await pool.execute(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ENUM(${list}) ${rest}`);
  console.log(`Added ${missing.map((v) => `'${v}'`).join(", ")} to ${table}.${column}.`);
  return true;
}

module.exports = { widenEnum };
