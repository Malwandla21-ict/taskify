const pool = require("../config/db");

function parseImageUrls(row) {
  if (!row) return row;
  if (Array.isArray(row.image_urls)) return row;
  try {
    row.image_urls = row.image_urls ? JSON.parse(row.image_urls) : [];
  } catch {
    row.image_urls = [];
  }
  return row;
}

/* Most-recent endorsement (if any) attached to this specific sales item,
   surfaced as "Recommended by Dr. X" on cards/detail pages. Real data —
   pulled via a correlated subquery so at most one row per item. */
const SELECT_FIELDS = `
  si.id, si.seller_id, si.title, si.description, si.category,
  si.section, si.price, si.condition_status, si.location,
  si.status, si.created_at, si.image_urls,
  u.full_name AS seller_name,
  u.profile_photo_url AS seller_profile_photo,
  u.phone_number AS seller_phone_number,
  le.endorsement_type AS endorsement_type,
  lecturer.full_name AS endorsed_by_lecturer_name,
  lecturer.lecturer_title AS endorsed_by_lecturer_title
`;

const ENDORSEMENT_JOIN = `
  LEFT JOIN lecturer_endorsements le
    ON le.context_type = 'sales_item' AND le.context_id = si.id
    AND le.id = (
      SELECT id FROM lecturer_endorsements le2
      WHERE le2.context_type = 'sales_item' AND le2.context_id = si.id
      ORDER BY le2.created_at DESC LIMIT 1
    )
  LEFT JOIN users lecturer ON le.lecturer_id = lecturer.id
`;

async function createSalesItem({
  sellerId, title, description, category, section,
  price, conditionStatus, location, imageUrls = []
}) {
  const [result] = await pool.execute(
    `INSERT INTO sales_items (
       seller_id, title, description, category, section,
       price, condition_status, location, status, image_urls
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Available', ?)`,
    [
      sellerId, title.trim(), description.trim(), category.trim(),
      section || "Academic", Number(price),
      conditionStatus || "Good", location.trim(),
      imageUrls.length ? JSON.stringify(imageUrls) : null
    ]
  );
  return getSalesItemById(result.insertId);
}

async function getAllAvailableSalesItems() {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS}
     FROM sales_items si
     INNER JOIN users u ON si.seller_id = u.id
     ${ENDORSEMENT_JOIN}
     WHERE si.status = 'Available'
     ORDER BY si.created_at DESC`
  );
  return rows.map(parseImageUrls);
}

async function getMySalesItems(userId) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS}
     FROM sales_items si
     INNER JOIN users u ON si.seller_id = u.id
     ${ENDORSEMENT_JOIN}
     WHERE si.seller_id = ?
     ORDER BY si.created_at DESC`,
    [userId]
  );
  return rows.map(parseImageUrls);
}

async function markSalesItemAsSold(itemId, userId) {
  const [itemRows] = await pool.execute(
    `SELECT id, seller_id, status FROM sales_items WHERE id = ? LIMIT 1`, [itemId]
  );

  if (itemRows.length === 0) {
    const error = new Error("Sales item not found."); error.statusCode = 404; throw error;
  }

  const item = itemRows[0];

  if (Number(item.seller_id) !== Number(userId)) {
    const error = new Error("Only the seller can mark this item as sold."); error.statusCode = 403; throw error;
  }
  if (item.status === "Sold") {
    const error = new Error("This item is already marked as sold."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE sales_items SET status = 'Sold' WHERE id = ?`, [itemId]);
  return getSalesItemById(itemId);
}

async function getSalesItemById(itemId) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS}
     FROM sales_items si
     INNER JOIN users u ON si.seller_id = u.id
     ${ENDORSEMENT_JOIN}
     WHERE si.id = ? LIMIT 1`,
    [itemId]
  );
  return parseImageUrls(rows[0]);
}

async function deleteSalesItem(itemId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, seller_id, status FROM sales_items WHERE id = ? LIMIT 1`, [itemId]
  );

  if (rows.length === 0) {
    const error = new Error("Sales item not found."); error.statusCode = 404; throw error;
  }

  const item = rows[0];

  if (Number(item.seller_id) !== Number(userId)) {
    const error = new Error("Only the seller can delete this listing."); error.statusCode = 403; throw error;
  }

  await pool.execute(`DELETE FROM sales_items WHERE id = ?`, [itemId]);
}

module.exports = {
  createSalesItem,
  getAllAvailableSalesItems,
  getMySalesItems,
  getSalesItemById,
  markSalesItemAsSold,
  deleteSalesItem
};