const pool = require("../config/db");
const { attachLatestEndorsements, attachLatestEndorsement } = require("./endorsementLookup.service");
const notificationService = require("./notification.service");
const contentModerationService = require("./contentModeration.service");
const crypto = require("crypto");
const { SALES } = require("../config/paymentSettings");
const { roundMoney } = require("./trust.service");
const { closeOpenOffers, notifyClosedOffers, deleteOffersFor } = require("./offerClosure.service");

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

/* ── Taskify Protection (DEMO escrow + handover code) ──────────────────
   Nothing here moves real money — see config/paymentSettings.js.

   1. Buyer "pays" → an order row is created with status 'Held' and the
      item becomes 'Reserved' (hidden from the public list).
   2. They meet on campus. Once the buyer has checked the item, they show
      the seller their 4-digit handover code.
   3. Seller types the code in → order 'Released', item 'Sold'.
   Either side can cancel before that → order 'Refunded', item back to
   'Available'. Too many wrong codes locks the release. */

/* forceProtection: a price agreed through an in-app offer always goes
   through Taskify Protection — even if the deal ended up below the
   threshold — because the deal was made in the app. */
function paymentRulesFor(price, { forceProtection = false } = {}) {
  const itemPrice = Number(price);
  const requiresProtection = forceProtection || itemPrice >= SALES.escrowThreshold;
  const protectionFee = requiresProtection ? roundMoney(itemPrice * (SALES.protectionFeePercent / 100)) : 0;
  return {
    demo: true,
    escrowThreshold: SALES.escrowThreshold,
    protectionFeePercent: SALES.protectionFeePercent,
    requiresProtection,
    itemPrice,
    protectionFee,
    total: roundMoney(itemPrice + protectionFee)
  };
}

function generateHandoverCode() {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
}

async function getOrderById(orderId) {
  const [rows] = await pool.execute(
    `SELECT so.*, si.title AS item_title
     FROM sale_orders so
     INNER JOIN sales_items si ON so.sales_item_id = si.id
     WHERE so.id = ? LIMIT 1`,
    [orderId]
  );
  if (!rows.length) {
    const error = new Error("Order not found."); error.statusCode = 404; throw error;
  }
  return rows[0];
}

/* What one viewer is allowed to see about an order. The handover code is
   ONLY ever sent to the buyer — never to the seller or anyone else. */
function orderViewFor(order, viewerId) {
  if (!order) return null;
  const isBuyer = Number(order.buyer_id) === Number(viewerId);
  const isSeller = Number(order.seller_id) === Number(viewerId);
  if (!isBuyer && !isSeller) return null;

  const attemptsLeft = Math.max(0, SALES.maxCodeAttempts - Number(order.code_attempts || 0));
  return {
    id: order.id,
    role: isBuyer ? "buyer" : "seller",
    status: order.status,
    item_price: Number(order.item_price),
    protection_fee: Number(order.protection_fee),
    total_amount: Number(order.total_amount),
    buyer_id: order.buyer_id,
    buyer_name: order.buyer_name,
    seller_id: order.seller_id,
    created_at: order.created_at,
    released_at: order.released_at,
    cancelled_by: order.cancelled_by,
    attempts_left: attemptsLeft,
    locked: order.status === "Held" && attemptsLeft === 0,
    handover_code: isBuyer && order.status === "Held" ? order.handover_code : null
  };
}

async function getLatestOrderForViewer(itemId, viewerId) {
  if (viewerId == null) return null;
  const [rows] = await pool.execute(
    `SELECT so.*, buyer.full_name AS buyer_name
     FROM sale_orders so
     INNER JOIN users buyer ON so.buyer_id = buyer.id
     WHERE so.sales_item_id = ? AND (so.buyer_id = ? OR so.seller_id = ?)
     ORDER BY so.created_at DESC, so.id DESC
     LIMIT 1`,
    [itemId, viewerId, viewerId]
  );
  return orderViewFor(rows[0], viewerId);
}

/* The one place a sales item gets reserved and the buyer's (demo) payment
   held — used by the "Buy with Taskify Protection" button (listed price)
   AND by an accepted offer (offer.service.js).

   Options (only offer.service passes them):
     agreedPrice  — the price both sides agreed on; the protection fee is
                    worked out on this, and protection applies even below
                    the threshold
     beforeCommit — async (connection, item) => {...}; runs inside this
                    same transaction right after the item is reserved, so
                    the offer is marked Accepted in the same all-or-nothing
                    step */
async function buySalesItem(itemId, buyerId, { agreedPrice = null, beforeCommit = null } = {}) {
  const item = await getSalesItemById(itemId);
  if (!item || item.moderation_status !== "clean") {
    const error = new Error("Sales item not found."); error.statusCode = 404; throw error;
  }
  if (Number(item.seller_id) === Number(buyerId)) {
    const error = new Error("You cannot buy your own item."); error.statusCode = 400; throw error;
  }
  if (item.status !== "Available") {
    const error = new Error("This item is no longer available."); error.statusCode = 400; throw error;
  }

  const rules = agreedPrice != null
    ? paymentRulesFor(agreedPrice, { forceProtection: true })
    : paymentRulesFor(item.price);
  if (!rules.requiresProtection) {
    const error = new Error(`Items under R${SALES.escrowThreshold} are paid in cash when you meet. Message the seller to arrange it.`);
    error.statusCode = 400; throw error;
  }

  const connection = await pool.getConnection();
  let orderId;
  let closedOffers = [];
  const handoverCode = generateHandoverCode();
  try {
    await connection.beginTransaction();

    /* Conditional update = only one buyer can ever reserve the item, even
       if two people press "Buy" at the same moment. */
    const [reserve] = await connection.execute(
      `UPDATE sales_items SET status = 'Reserved' WHERE id = ? AND status = 'Available'`,
      [itemId]
    );
    if (reserve.affectedRows !== 1) {
      const error = new Error("Someone else has just reserved this item."); error.statusCode = 409; throw error;
    }

    const [result] = await connection.execute(
      `INSERT INTO sale_orders (
         sales_item_id, buyer_id, seller_id, item_price, protection_fee,
         total_amount, handover_code, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Held')`,
      [itemId, buyerId, item.seller_id, rules.itemPrice, rules.protectionFee, rules.total, handoverCode]
    );
    orderId = result.insertId;

    if (beforeCommit) await beforeCommit(connection, item);

    /* The item is taken — every other open offer on it is closed. */
    closedOffers = await closeOpenOffers(connection, "sales_item", itemId, { winnerId: buyerId });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await notifyClosedOffers(closedOffers, {
    contextType: "sales_item", contextId: itemId, title: item.title,
    reason: "another buyer is buying the item"
  });

  const [buyerRows] = await pool.execute(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [buyerId]);
  const buyerName = buyerRows[0]?.full_name || "A student";

  await notificationService.createNotification({
    userId: item.seller_id,
    title: "Item Paid — Money Held",
    message: `${buyerName} paid R${rules.itemPrice.toFixed(2)} for "${item.title}" through Taskify Protection (demo). The money is held until you hand the item over. Meet somewhere safe on campus, let them check it, then ask for their 4-digit handover code and enter it on the item page.`,
    contextType: "sales_item",
    contextId: itemId,
    email: true
  });
  await notificationService.createNotification({
    userId: buyerId,
    title: "Payment Held Safely",
    message: `Your R${rules.total.toFixed(2)} payment for "${item.title}" is held by Taskify (demo). Your handover code is on the item page. Only give it to the seller once you have the item and you're happy with it.`,
    contextType: "sales_item",
    contextId: itemId
  });

  const order = await getLatestOrderForViewer(itemId, buyerId);
  return { order, orderId };
}

async function releaseSaleOrder(orderId, sellerId, code) {
  const order = await getOrderById(orderId);

  if (Number(order.seller_id) !== Number(sellerId)) {
    const error = new Error("Only the seller can enter the handover code."); error.statusCode = 403; throw error;
  }
  if (order.status !== "Held") {
    const error = new Error("This order is no longer waiting for a handover code."); error.statusCode = 400; throw error;
  }
  if (Number(order.code_attempts) >= SALES.maxCodeAttempts) {
    const error = new Error("Too many wrong codes were entered, so this order is locked. The buyer can cancel it for a refund."); error.statusCode = 423; throw error;
  }

  const entered = String(code || "").trim();
  const expected = String(order.handover_code);
  const matches = entered.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(entered), Buffer.from(expected));

  if (!matches) {
    const attempts = Number(order.code_attempts) + 1;
    await pool.execute(`UPDATE sale_orders SET code_attempts = ? WHERE id = ?`, [attempts, orderId]);
    const left = Math.max(0, SALES.maxCodeAttempts - attempts);

    if (left === 0) {
      await notificationService.createNotification({
        userId: order.buyer_id,
        title: "Handover Code Locked",
        message: `Several wrong handover codes were entered for "${order.item_title}", so the order is locked to protect your money. If you didn't receive the item, cancel the order on the item page for a refund (demo).`,
        contextType: "sales_item",
        contextId: order.sales_item_id,
        email: true
      });
    }

    const error = new Error(left > 0
      ? `That code is wrong. ${left} attempt${left === 1 ? "" : "s"} left.`
      : "That code is wrong. This order is now locked — the buyer can cancel it for a refund.");
    error.statusCode = 400; throw error;
  }

  await pool.execute(
    `UPDATE sale_orders SET status = 'Released', released_at = NOW() WHERE id = ? AND status = 'Held'`,
    [orderId]
  );
  await pool.execute(`UPDATE sales_items SET status = 'Sold' WHERE id = ?`, [order.sales_item_id]);

  await notificationService.createNotification({
    userId: order.seller_id,
    title: "Payment Released",
    message: `Handover complete! R${Number(order.item_price).toFixed(2)} for "${order.item_title}" has been released to you (demo).`,
    contextType: "sales_item",
    contextId: order.sales_item_id
  });
  await notificationService.createNotification({
    userId: order.buyer_id,
    title: "Purchase Complete",
    message: `You confirmed the handover of "${order.item_title}". Your payment has been released to the seller (demo). Enjoy!`,
    contextType: "sales_item",
    contextId: order.sales_item_id
  });

  return getLatestOrderForViewer(order.sales_item_id, sellerId);
}

async function cancelSaleOrder(orderId, userId) {
  const order = await getOrderById(orderId);
  const isBuyer = Number(order.buyer_id) === Number(userId);
  const isSeller = Number(order.seller_id) === Number(userId);

  if (!isBuyer && !isSeller) {
    const error = new Error("You are not part of this order."); error.statusCode = 403; throw error;
  }
  if (order.status !== "Held") {
    const error = new Error("Only an order that is still waiting for handover can be cancelled."); error.statusCode = 400; throw error;
  }

  await pool.execute(
    `UPDATE sale_orders SET status = 'Refunded', cancelled_by = ? WHERE id = ? AND status = 'Held'`,
    [isBuyer ? "buyer" : "seller", orderId]
  );
  await pool.execute(
    `UPDATE sales_items SET status = 'Available' WHERE id = ? AND status = 'Reserved'`,
    [order.sales_item_id]
  );

  await notificationService.createNotification({
    userId: isBuyer ? order.seller_id : order.buyer_id,
    title: "Order Cancelled",
    message: isBuyer
      ? `The buyer cancelled their order for "${order.item_title}". The item is listed as available again.`
      : `The seller cancelled your order for "${order.item_title}". Your R${Number(order.total_amount).toFixed(2)} has been refunded (demo).`,
    contextType: "sales_item",
    contextId: order.sales_item_id
  });
  if (isBuyer) {
    await notificationService.createNotification({
      userId: order.buyer_id,
      title: "Refund Complete",
      message: `You cancelled your order for "${order.item_title}". Your R${Number(order.total_amount).toFixed(2)} has been refunded (demo).`,
      contextType: "sales_item",
      contextId: order.sales_item_id
    });
  }

  return getLatestOrderForViewer(order.sales_item_id, userId);
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
  if (item.status === "Reserved") {
    const error = new Error("A buyer has paid for this item through Taskify Protection. Enter their handover code on the item page instead."); error.statusCode = 400; throw error;
  }

  await pool.execute(`UPDATE sales_items SET status = 'Sold' WHERE id = ?`, [itemId]);

  const closedOffers = await closeOpenOffers(pool, "sales_item", itemId);
  const sold = await getSalesItemById(itemId);
  await notifyClosedOffers(closedOffers, {
    contextType: "sales_item", contextId: itemId, title: sold.title,
    reason: "the seller marked it as sold"
  });
  return sold;
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

  /* DEMO payment info for the item page: which way this item is paid
     (cash vs Taskify Protection) and, for the buyer/seller only, their
     latest order on it. */
  item.payment_rules = paymentRulesFor(item.price);
  item.my_order = await getLatestOrderForViewer(item.id, viewerId);

  /* Phone numbers are never in public listing data — the buyer and seller
     only see each other's once a (demo) payment is held between them. */
  if (item.my_order && ["Held", "Released"].includes(item.my_order.status)) {
    const [phoneRows] = await pool.execute(
      `SELECT id, phone_number FROM users WHERE id IN (?, ?)`,
      [item.my_order.buyer_id, item.my_order.seller_id]
    );
    const phoneOf = (id) => phoneRows.find(r => Number(r.id) === Number(id))?.phone_number || null;
    if (item.my_order.role === "buyer") item.seller_phone_number = phoneOf(item.my_order.seller_id);
    else item.my_order.buyer_phone_number = phoneOf(item.my_order.buyer_id);
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
  if (item.status === "Reserved") {
    const error = new Error("A buyer's payment is being held for this item. Cancel the order first, then delete the listing."); error.statusCode = 400; throw error;
  }

  const [titleRows] = await pool.execute(`SELECT title FROM sales_items WHERE id = ? LIMIT 1`, [itemId]);
  const closedOffers = await closeOpenOffers(pool, "sales_item", itemId);
  await deleteOffersFor(pool, "sales_item", itemId);
  await pool.execute(`DELETE FROM sales_items WHERE id = ?`, [itemId]);

  await notifyClosedOffers(closedOffers, {
    contextType: "sales_item", contextId: itemId, title: titleRows[0]?.title || "the item",
    reason: "the seller deleted the listing"
  });
}

module.exports = {
  createSalesItem,
  getAllAvailableSalesItems,
  getMySalesItems,
  getSalesItemById,
  getSalesItemByIdForViewing,
  markSalesItemAsSold,
  deleteSalesItem,
  buySalesItem,
  releaseSaleOrder,
  cancelSaleOrder,
  paymentRulesFor
};