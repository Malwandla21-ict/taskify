const pool = require("../config/db");
const { attachLatestEndorsements, attachLatestEndorsement } = require("./endorsementLookup.service");
const notificationService = require("./notification.service");
const contentModerationService = require("./contentModeration.service");
const { moderateListingEdit, notifyEditFlagged } = require("./listingEdit.service");
const crypto = require("crypto");
const { SALES } = require("../config/paymentSettings");
const { roundMoney } = require("./trust.service");
const { closeOpenOffers, notifyClosedOffers, deleteOffersFor } = require("./offerClosure.service");
const { messagingAccess } = require("./conversation.service");
const reportService = require("./report.service");
const auditLogService = require("./auditlog.service");

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
  IF(u.lecturer_verified = 1, u.lecturer_title, NULL) AS seller_lecturer_title,
  u.lecturer_verified AS seller_lecturer_verified
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

/* Only the seller, and only while the item is "Available" — once a
   buyer's payment is held (Reserved) or it's Sold, the listing is fixed. */
async function updateSalesItem(itemId, userId, {
  title, description, category, section, price, conditionStatus, location, imageUrls = []
}) {
  const [rows] = await pool.execute(
    `SELECT id, seller_id, status, moderation_status, moderation_flags FROM sales_items WHERE id = ? LIMIT 1`, [itemId]
  );

  if (rows.length === 0) {
    const error = new Error("Sales item not found."); error.statusCode = 404; throw error;
  }

  const item = rows[0];

  if (Number(item.seller_id) !== Number(userId)) {
    const error = new Error("Only the seller can edit this listing."); error.statusCode = 403; throw error;
  }
  if (item.status !== "Available") {
    const error = new Error(item.status === "Reserved"
      ? "A buyer's payment is being held for this item, so it can't be edited."
      : "This item has been sold, so it can't be edited.");
    error.statusCode = 400;
    throw error;
  }

  const moderation = await moderateListingEdit({
    contentType: "sales_item", userId, title, description, imageUrls, current: item
  });

  /* "AND status = 'Available'" so a purchase that lands while this request
     is running keeps the price the buyer actually paid. */
  const [result] = await pool.execute(
    `UPDATE sales_items
     SET title = ?, description = ?, category = ?, section = ?,
         price = ?, condition_status = ?, location = ?, image_urls = ?,
         moderation_status = ?, moderation_flags = ?
     WHERE id = ? AND status = 'Available'`,
    [
      title.trim(), description.trim(), category.trim(),
      section || "Academic", Number(price),
      conditionStatus || "Good", location.trim(),
      imageUrls.length ? JSON.stringify(imageUrls) : null,
      moderation.moderationStatus, moderation.moderationFlags,
      itemId
    ]
  );

  if (result.affectedRows === 0) {
    const error = new Error("Someone bought this item while you were editing it, so your changes weren't saved.");
    error.statusCode = 409;
    throw error;
  }

  if (moderation.newlyFlagged) {
    await notifyEditFlagged({
      contentType: "sales_item", contextId: itemId, userId, title,
      flaggedCategories: moderation.flaggedCategories
    });
  }

  return getSalesItemById(itemId);
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

/* "Report a problem" on an order that hasn't been handed over yet. `who`
   is which side may pick it; `report` is the matching admin Reports
   category (report.service.js VALID_CATEGORIES). */
const SALE_DISPUTE_CATEGORIES = {
  no_show:             { label: "They didn't turn up", who: ["buyer", "seller"], report: "no_show" },
  not_as_described:    { label: "The item isn't what was advertised", who: ["buyer"], report: "not_as_described" },
  damaged_item:        { label: "The item is broken or damaged", who: ["buyer"], report: "damaged_item" },
  handed_over_no_code: { label: "I handed the item over but didn't get the code", who: ["seller"], report: "payment" },
  code_problem:        { label: "The handover code isn't working", who: ["buyer", "seller"], report: "payment" },
  other:               { label: "Something else", who: ["buyer", "seller"], report: "other" }
};

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
  const waitingForHandover = ["Held", "Disputed"].includes(order.status);
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
    locked: waitingForHandover && attemptsLeft === 0,
    /* The buyer keeps their code while a problem is being looked at — if
       they meet and sort it out, the handover still works as normal. */
    handover_code: isBuyer && waitingForHandover ? order.handover_code : null,
    /* "Report a problem" details — only ever sent to the buyer and seller. */
    disputed_at: order.disputed_at || null,
    disputed_by: order.disputed_by || null,
    dispute_category: order.dispute_category || null,
    dispute_category_label: SALE_DISPUTE_CATEGORIES[order.dispute_category]?.label || null,
    dispute_reason: order.dispute_reason || null,
    dispute_outcome: order.dispute_outcome || null
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

  /* The order row is locked while the code is checked, so simultaneous
     submissions are handled one at a time: the right code can only release
     the payment once, and a burst of guesses can't get past the attempt
     limit. */
  const connection = await pool.getConnection();
  let attempts;
  try {
    await connection.beginTransaction();
    const [lockedRows] = await connection.execute(
      `SELECT status, code_attempts, handover_code FROM sale_orders WHERE id = ? FOR UPDATE`, [orderId]
    );
    const locked = lockedRows[0];

    /* A reported ('Disputed') order can still be handed over: if they meet
       and sort it out, the buyer's code settles it like any other sale. */
    if (!["Held", "Disputed"].includes(locked.status)) {
      const error = new Error("This order is no longer waiting for a handover code."); error.statusCode = 400; throw error;
    }
    if (Number(locked.code_attempts) >= SALES.maxCodeAttempts) {
      const error = new Error(locked.status === "Disputed"
        ? "Too many wrong codes were entered, so this order is locked. An admin is looking at the problem that was reported."
        : "Too many wrong codes were entered, so this order is locked. The buyer can cancel it for a refund, or you can report a problem.");
      error.statusCode = 423; throw error;
    }

    const entered = String(code || "").trim();
    const expected = String(locked.handover_code);
    const matches = entered.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(entered), Buffer.from(expected));

    if (matches) {
      const wasDisputed = locked.status === "Disputed";
      await connection.execute(
        `UPDATE sale_orders
         SET dispute_outcome = IF(?, 'handed_over', dispute_outcome),
             dispute_resolved_at = IF(?, NOW(), dispute_resolved_at),
             status = 'Released', released_at = NOW()
         WHERE id = ? AND status = ?`,
        [wasDisputed, wasDisputed, orderId, locked.status]
      );
      await connection.execute(`UPDATE sales_items SET status = 'Sold' WHERE id = ?`, [order.sales_item_id]);
      if (wasDisputed) await resolvePartyReports(connection, order);
    } else {
      attempts = Number(locked.code_attempts) + 1;
      await connection.execute(`UPDATE sale_orders SET code_attempts = ? WHERE id = ?`, [attempts, orderId]);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  if (attempts !== undefined) {
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

/* Locks the order row and checks the viewer is the buyer or seller. */
async function lockOrderForParty(connection, orderId, userId) {
  const [rows] = await connection.execute(
    `SELECT so.*, si.title AS item_title
     FROM sale_orders so INNER JOIN sales_items si ON si.id = so.sales_item_id
     WHERE so.id = ? FOR UPDATE`,
    [orderId]
  );
  if (!rows.length) {
    const error = new Error("Order not found."); error.statusCode = 404; throw error;
  }
  const order = rows[0];
  const role = Number(order.buyer_id) === Number(userId) ? "buyer"
    : Number(order.seller_id) === Number(userId) ? "seller" : null;
  if (!role) {
    const error = new Error("You are not part of this order."); error.statusCode = 403; throw error;
  }
  return { order, role };
}

/* Once a reported order is settled, the buyer's/seller's own reports about
   it leave the admin queue. Reports by anyone else about the listing (e.g.
   "this item isn't allowed") stay open. */
async function resolvePartyReports(connection, order) {
  await connection.execute(
    `UPDATE reports SET status = 'Resolved'
     WHERE context_type = 'sales_item' AND context_id = ? AND status = 'Pending' AND reporter_id IN (?, ?)`,
    [order.sales_item_id, order.buyer_id, order.seller_id]
  );
}

/*
  Cancelling before the handover.
    Held      → either side may cancel: the buyer is refunded (demo) and
                the item goes back on sale.
    Disputed  → only the seller may (giving the buyer their money back).
                The buyer can't, because the seller may have said they
                already handed the item over — an admin decides instead.
  The order row is locked, so a double click can't refund twice.
*/
async function cancelSaleOrder(orderId, userId) {
  const connection = await pool.getConnection();
  let order;
  let role;
  try {
    await connection.beginTransaction();
    ({ order, role } = await lockOrderForParty(connection, orderId, userId));

    if (order.status === "Disputed" && role === "buyer") {
      const error = new Error("A problem has been reported on this order, so an admin will decide what happens to the money. You can still message the seller to sort it out.");
      error.statusCode = 400; throw error;
    }
    if (!["Held", "Disputed"].includes(order.status)) {
      const error = new Error("Only an order that is still waiting for handover can be cancelled."); error.statusCode = 400; throw error;
    }

    const wasDisputed = order.status === "Disputed";
    await connection.execute(
      `UPDATE sale_orders
       SET dispute_outcome = IF(?, 'seller_refunded', dispute_outcome),
           dispute_resolved_at = IF(?, NOW(), dispute_resolved_at),
           status = 'Refunded', cancelled_by = ?
       WHERE id = ? AND status = ?`,
      [wasDisputed, wasDisputed, role, orderId, order.status]
    );
    await connection.execute(
      `UPDATE sales_items SET status = 'Available' WHERE id = ? AND status = 'Reserved'`,
      [order.sales_item_id]
    );
    if (wasDisputed) await resolvePartyReports(connection, order);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const isBuyer = role === "buyer";
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

/*
  "Report a problem" — the meetup failed or the handover went wrong.
  Either side can report on an order still waiting for handover. The order
  becomes 'Disputed': the money stays held, the item stays reserved, the
  other person is told, and a report lands in the admin Reports queue.
  From there: the seller can still enter the buyer's code (they sorted it
  out), the seller can refund the buyer, or an admin decides
  (resolveSaleDispute).
*/
async function disputeSaleOrder(orderId, userId, { reason, category = "other" }) {
  const cleanReason = String(reason || "").trim().slice(0, 500);
  const connection = await pool.getConnection();
  let order;
  let role;
  try {
    await connection.beginTransaction();
    ({ order, role } = await lockOrderForParty(connection, orderId, userId));

    const kind = SALE_DISPUTE_CATEGORIES[category];
    if (!kind || !kind.who.includes(role)) {
      const error = new Error("Please choose what went wrong from the list."); error.statusCode = 400; throw error;
    }
    if (order.status !== "Held") {
      const error = new Error(order.status === "Disputed"
        ? "A problem has already been reported on this order. An admin is looking at it."
        : "You can only report a problem before the item has been handed over.");
      error.statusCode = 400; throw error;
    }

    await connection.execute(
      `UPDATE sale_orders
       SET status = 'Disputed', disputed_at = NOW(), disputed_by = ?, dispute_category = ?, dispute_reason = ?,
           dispute_outcome = NULL, dispute_resolved_at = NULL
       WHERE id = ? AND status = 'Held'`,
      [role, category, cleanReason, orderId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const otherId = role === "buyer" ? order.seller_id : order.buyer_id;
  const label = SALE_DISPUTE_CATEGORIES[category].label;
  try {
    await reportService.createReport({
      reporterId: userId, reportedUserId: otherId,
      contextType: "sales_item", contextId: order.sales_item_id,
      reason: `${label}: ${cleanReason}`, category: SALE_DISPUTE_CATEGORIES[category].report
    });
  } catch (error) {
    /* 409 = the same person already has this kind of report open on the
       item — the admin queue already has it, so the dispute still stands. */
    if (error.statusCode !== 409) throw error;
  }

  await notificationService.createNotification({
    userId: otherId,
    title: "Problem Reported",
    message: `The ${role} reported a problem with "${order.item_title}": ${label.toLowerCase()}. The money stays held and the item stays reserved while a Taskify admin looks at it. If you meet and sort it out, the handover code still works as normal.`,
    contextType: "sales_item",
    contextId: order.sales_item_id,
    email: true
  });

  return getLatestOrderForViewer(order.sales_item_id, userId);
}

const SALE_DISPUTE_OUTCOMES = {
  release: {
    outcome: "released",
    buyer: (t) => `An admin looked at the problem reported on "${t}" and released the payment to the seller (demo). The sale is complete.`,
    seller: (t) => `An admin looked at the problem reported on "${t}" and released the payment to you (demo). The sale is complete.`
  },
  refund: {
    outcome: "refunded",
    buyer: (t) => `An admin looked at the problem reported on "${t}" and refunded your payment (demo).`,
    seller: (t) => `An admin looked at the problem reported on "${t}" and refunded the buyer (demo). Your item is listed again — edit or delete it if you no longer have it.`
  },
  retry: {
    outcome: "retry",
    buyer: (t) => `An admin looked at the problem reported on "${t}" and asked you both to try the handover again. Your money is still held, and you have a NEW handover code on the item page.`,
    seller: (t) => `An admin looked at the problem reported on "${t}" and asked you both to try the handover again. The money is still held. Meet the buyer and enter their new code.`
  }
};

/* Admin decision on a reported sale: pay the seller, refund the buyer (the
   item goes back on sale), or send them back to try the handover again
   with a fresh code. Only for orders in 'Disputed'. */
async function resolveSaleDispute(orderId, adminId, outcomeKey, note = "") {
  const outcome = SALE_DISPUTE_OUTCOMES[outcomeKey];
  if (!outcome) {
    const error = new Error("Choose release, refund or retry."); error.statusCode = 400; throw error;
  }

  const connection = await pool.getConnection();
  let order;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT so.*, si.title AS item_title
       FROM sale_orders so INNER JOIN sales_items si ON si.id = so.sales_item_id
       WHERE so.id = ? FOR UPDATE`,
      [orderId]
    );
    if (!rows.length) {
      const error = new Error("Order not found."); error.statusCode = 404; throw error;
    }
    order = rows[0];
    if (order.status !== "Disputed") {
      const error = new Error("This order isn't disputed (it may already have been settled)."); error.statusCode = 400; throw error;
    }

    if (outcomeKey === "release") {
      await connection.execute(
        `UPDATE sale_orders SET dispute_outcome = 'released', dispute_resolved_at = NOW(), status = 'Released', released_at = NOW()
         WHERE id = ? AND status = 'Disputed'`, [orderId]
      );
      await connection.execute(`UPDATE sales_items SET status = 'Sold' WHERE id = ?`, [order.sales_item_id]);
    } else if (outcomeKey === "refund") {
      await connection.execute(
        `UPDATE sale_orders SET dispute_outcome = 'refunded', dispute_resolved_at = NOW(), status = 'Refunded'
         WHERE id = ? AND status = 'Disputed'`, [orderId]
      );
      await connection.execute(
        `UPDATE sales_items SET status = 'Available' WHERE id = ? AND status = 'Reserved'`, [order.sales_item_id]
      );
    } else {
      /* A fresh code and a fresh set of attempts — the old code may have
         been seen or half-guessed during the failed meetup. */
      await connection.execute(
        `UPDATE sale_orders SET dispute_outcome = 'retry', dispute_resolved_at = NOW(), status = 'Held',
                                handover_code = ?, code_attempts = 0
         WHERE id = ? AND status = 'Disputed'`, [generateHandoverCode(), orderId]
      );
    }
    await resolvePartyReports(connection, order);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await auditLogService.createAuditLog({
    adminId,
    action: `sale.dispute_${outcome.outcome}`,
    targetType: "sale_order",
    targetId: orderId,
    reason: String(note || "").trim().slice(0, 500) || null,
    metadata: { salesItemId: order.sales_item_id }
  });

  for (const [userId, text] of [[order.buyer_id, outcome.buyer(order.item_title)], [order.seller_id, outcome.seller(order.item_title)]]) {
    await notificationService.createNotification({
      userId, title: "Sale Problem Settled", message: text,
      contextType: "sales_item", contextId: order.sales_item_id, email: true
    });
  }

  const [rows] = await pool.execute(`SELECT id, status, dispute_outcome FROM sale_orders WHERE id = ?`, [orderId]);
  return rows[0];
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
  if (item.my_order && ["Held", "Disputed", "Released"].includes(item.my_order.status)) {
    const [phoneRows] = await pool.execute(
      `SELECT id, phone_number FROM users WHERE id IN (?, ?)`,
      [item.my_order.buyer_id, item.my_order.seller_id]
    );
    const phoneOf = (id) => phoneRows.find(r => Number(r.id) === Number(id))?.phone_number || null;
    if (item.my_order.role === "buyer") item.seller_phone_number = phoneOf(item.my_order.seller_id);
    else item.my_order.buyer_phone_number = phoneOf(item.my_order.buyer_id);
  }

  /* Whether this viewer may open a chat about it — the same rule
     conversation.service's startConversation enforces. */
  item.can_message = (await messagingAccess("sale", item.id, viewerId)).allowed;

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
  updateSalesItem,
  getAllAvailableSalesItems,
  getMySalesItems,
  getSalesItemById,
  getSalesItemByIdForViewing,
  markSalesItemAsSold,
  deleteSalesItem,
  buySalesItem,
  releaseSaleOrder,
  cancelSaleOrder,
  disputeSaleOrder,
  resolveSaleDispute,
  SALE_DISPUTE_CATEGORIES,
  paymentRulesFor
};