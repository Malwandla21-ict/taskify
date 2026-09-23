const pool = require("../config/db");
const { attachLatestEndorsements, attachLatestEndorsement } = require("./endorsementLookup.service");
const notificationService = require("./notification.service");
const contentModerationService = require("./contentModeration.service");

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

const SELECT_FIELDS = `
  si.id, si.seller_id, si.title, si.description, si.category,
  si.section, si.price, si.condition_status, si.location,
  si.status, si.created_at, si.image_urls, si.moderation_status,
  u.full_name AS seller_name,
  u.profile_photo_url AS seller_profile_photo,
  u.phone_number AS seller_phone_number,
  u.member_type AS seller_member_type,
  u.lecturer_title AS seller_lecturer_title
`;

async function createSalesItem({
  sellerId, title, description, category, section,
  price, conditionStatus, location, imageUrls = []
}) {
  const moderation = await contentModerationService.evaluateListingContent({ title, description, imageUrls });

  if (moderation.severe) {
    await contentModerationService.recordBlockedAttempt({
      contentType: "sales_item", userId: sellerId, title, description,
      flaggedCategories: moderation.flaggedCategories
    });
    await notificationService.notifyAllAdmins({
      title: "Content Blocked",
      message: `A sales listing titled "${(title || "").trim()}" was blocked at creation for violating content policy (${moderation.flaggedCategories.join(", ")}).`,
      email: true
    });

    const error = new Error("This content violates our content policy and cannot be posted.");
    error.statusCode = 400;
    throw error;
  }

  const [result] = await pool.execute(
    `INSERT INTO sales_items (
       seller_id, title, description, category, section,
       price, condition_status, location, status, image_urls,
       moderation_status, moderation_flags
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?, ?)`,
    [
      sellerId, title.trim(), description.trim(), category.trim(),
      section || "Academic", Number(price),
      conditionStatus || "Good", location.trim(),
      imageUrls.length ? JSON.stringify(imageUrls) : null,
      moderation.flagged ? "pending_review" : "clean",
      moderation.flagged ? JSON.stringify(moderation.flaggedCategories) : null
    ]
  );

  if (moderation.flagged) {
    await notificationService.notifyAllAdmins({
      title: "Content Flagged for Review",
      message: `A new sales listing, "${title.trim()}", was flagged for review (${moderation.flaggedCategories.join(", ")}).`,
      contextType: "sales_item",
      contextId: result.insertId,
      email: true
    });
    await notificationService.createNotification({
      userId: sellerId,
      title: "Listing Held for Review",
      message: `Your sales listing "${title.trim()}" was flagged by our moderation system and is held from public view until an admin reviews it. We'll let you know as soon as it's approved.`,
      contextType: "sales_item",
      contextId: result.insertId,
      email: true
    });
  }

  return getSalesItemById(result.insertId);
}

async function getAllAvailableSalesItems() {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS}
     FROM sales_items si
     INNER JOIN users u ON si.seller_id = u.id
     WHERE si.status = 'Available' AND si.moderation_status = 'clean'
     ORDER BY si.created_at DESC`
  );
  const parsed = rows.map(parseImageUrls);
  return attachLatestEndorsements(parsed, "sales_item");
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
  const parsed = rows.map(parseImageUrls);
  return attachLatestEndorsements(parsed, "sales_item");
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
  const parsed = parseImageUrls(rows[0]);
  return attachLatestEndorsement(parsed, "sales_item");
}

/* viewerId/viewerRole are optional (a guest passes neither). A listing
   that isn't 'clean' (pending_review or removed) is invisible to everyone
   except its own seller and admins — a 404, same as a genuinely missing
   item, so a direct link never reveals that something was flagged. See
   sales.controller.js's getSalesItemById. */
async function getSalesItemByIdForViewing(itemId, viewerId = null, viewerRole = null) {
  const item = await getSalesItemById(itemId);
  if (!item) {
    const error = new Error("Sales item not found."); error.statusCode = 404; throw error;
  }

  const isOwner = viewerId != null && Number(item.seller_id) === Number(viewerId);
  const isAdmin = viewerRole === "admin";
  if (item.moderation_status !== "clean" && !isOwner && !isAdmin) {
    const error = new Error("Sales item not found."); error.statusCode = 404; throw error;
  }

  return item;
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
  getSalesItemByIdForViewing,
  markSalesItemAsSold,
  deleteSalesItem
};