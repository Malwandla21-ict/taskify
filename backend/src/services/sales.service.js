const pool = require("../config/db");

/*
  Parse image_urls into a plain JS array, regardless of how the DB driver
  handed it back to us.

  - If the `image_urls` column is a MySQL JSON type, mysql2 auto-parses it
    into a real array before we ever see it — in that case we must NOT
    call JSON.parse() on it again (that would stringify the array via
    toString(), then fail to parse, and silently get swallowed by the
    catch block, wiping out the images).
  - If the column is TEXT/VARCHAR, it comes back as a JSON string and
    needs JSON.parse() as before.
*/
function parseImageUrls(row) {
  if (!row) return row;

  if (Array.isArray(row.image_urls)) {
    return row; // already parsed by the driver (JSON column)
  }

  try {
    row.image_urls = row.image_urls ? JSON.parse(row.image_urls) : [];
  } catch {
    row.image_urls = [];
  }
  return row;
}

const SELECT_FIELDS = `
  si.id, si.seller_id, si.title, si.description, si.category,
  si.section, si.price, si.condition_status, si.location,
  si.status, si.created_at, si.image_urls,
  u.full_name AS seller_name,
  u.phone_number AS seller_phone_number
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
     WHERE si.id = ? LIMIT 1`,
    [itemId]
  );
  return parseImageUrls(rows[0]);
}

module.exports = {
  deleteSalesItem,
  createSalesItem,
  getAllAvailableSalesItems,
  getMySalesItems,
  markSalesItemAsSold
};

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