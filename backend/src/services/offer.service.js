const pool = require("../config/db");
const notificationService = require("./notification.service");
const taskService = require("./task.service");
const salesService = require("./sales.service");
const { roundMoney } = require("./trust.service");
const { maskContactDetails } = require("../utils/contactMask");
const { NEGOTIATION, SALES } = require("../config/paymentSettings");

/*
  In-app offers ("Make an offer") — DEMO payments only, see
  config/paymentSettings.js.

  How a negotiation works:
    1. Someone who isn't the owner makes an offer (amount + optional note).
    2. Whoever's turn it is can Accept or Counter (new amount). The owner
       can Decline and the offerer can Withdraw at any time while it's open.
    3. Accepting does the real thing straight away, in one transaction:
         task  -> assigned to the offerer at the agreed price, poster's
                  payment held (same code as the normal Accept Task)
         sale  -> item reserved for the offerer at the agreed price, buyer's
                  payment held + handover code (same code as the normal Buy)
       and every other open offer on that listing is closed.

  Rules (numbers live in paymentSettings.js -> NEGOTIATION):
    - max counter-offers per negotiation, and each new amount expires if
      the other side doesn't respond in time (checked lazily — whenever an
      offer is read or acted on, not by a background job)
    - one open negotiation per person per listing
    - amount limits as a % of the listed price, always checked here
    - only the two people in a negotiation can see or touch it

  Locking order is always: listing row first, then offer rows. Everything
  that takes both locks takes them in that order, so two requests can
  never wait on each other forever (a deadlock).
*/

const CONTEXTS = {
  task: {
    table: "tasks", ownerCol: "created_by", titleCol: "title",
    openStatus: "Posted", percent: NEGOTIATION.taskAmountPercent,
    noun: "task", ownerNoun: "poster"
  },
  sales_item: {
    table: "sales_items", ownerCol: "seller_id", titleCol: "title",
    openStatus: "Available", percent: NEGOTIATION.saleAmountPercent,
    noun: "item", ownerNoun: "seller"
  }
};

function httpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function contextConfig(contextType) {
  const cfg = CONTEXTS[contextType];
  if (!cfg) throw httpError("Invalid listing type.", 400);
  return cfg;
}

/* executor = the pool, or a transaction's connection. */
async function loadListing(executor, contextType, contextId, { lock = false } = {}) {
  const cfg = contextConfig(contextType);
  const [rows] = await executor.execute(
    `SELECT id, ${cfg.ownerCol} AS owner_id, ${cfg.titleCol} AS title, price, status, moderation_status
     FROM ${cfg.table} WHERE id = ? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [contextId]
  );
  if (!rows.length) throw httpError(`That ${cfg.noun} doesn't exist.`, 404);
  return rows[0];
}

function amountRange(contextType, listedPrice) {
  const { percent } = contextConfig(contextType);
  const listed = Number(listedPrice);
  return {
    listed,
    min: roundMoney(listed * percent.min / 100),
    max: roundMoney(listed * percent.max / 100)
  };
}

/* Why this person can't start a negotiation on this listing (not counting
   "you already have one open"), or null if they can. */
function offerBlockReason(listing, contextType, userId) {
  const cfg = contextConfig(contextType);
  if (Number(listing.owner_id) === Number(userId)) return `You can't make an offer on your own ${cfg.noun}.`;
  if (listing.status !== cfg.openStatus) return `This ${cfg.noun} is no longer open for offers.`;
  if (Number(listing.price) <= 0) return `This ${cfg.noun} has no price to negotiate.`;
  if (contextType === "sales_item" && Number(listing.price) < SALES.escrowThreshold) {
    return `Offers are only available on items priced R${SALES.escrowThreshold} or more. For cheaper items, message the seller.`;
  }
  return null;
}

function assertVisibleListing(listing, contextType, userId) {
  const isOwner = Number(listing.owner_id) === Number(userId);
  if (listing.moderation_status !== "clean" && !isOwner) {
    throw httpError(`That ${contextConfig(contextType).noun} doesn't exist.`, 404);
  }
}

function parseAmount(raw, range) {
  const amount = roundMoney(raw);
  if (!Number.isFinite(amount) || amount <= 0) throw httpError("Enter a valid amount.", 400);
  if (amount < range.min || amount > range.max) {
    throw httpError(`Offers must be between R${range.min.toFixed(2)} and R${range.max.toFixed(2)}.`, 400);
  }
  return amount;
}

/* Optional note. Contact details are hidden, same as in chat. */
function cleanMessage(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (text.length > NEGOTIATION.messageMaxLength) {
    throw httpError(`Keep your note under ${NEGOTIATION.messageMaxLength} characters.`, 400);
  }
  return maskContactDetails(text).text;
}

/* Lazy expiry: an open offer whose time is up is marked Expired the next
   time anyone reads or acts on it. */
async function expireStaleOffers(executor, { offerId = null, contextType = null, contextId = null } = {}) {
  if (offerId != null) {
    await executor.execute(
      `UPDATE offers SET status = 'Expired' WHERE id = ? AND status = 'Pending' AND expires_at <= NOW()`,
      [offerId]
    );
  } else {
    await executor.execute(
      `UPDATE offers SET status = 'Expired'
       WHERE context_type = ? AND context_id = ? AND status = 'Pending' AND expires_at <= NOW()`,
      [contextType, contextId]
    );
  }
}

function roleOf(offer, userId) {
  if (Number(offer.offerer_id) === Number(userId)) return "offerer";
  if (Number(offer.owner_id) === Number(userId)) return "owner";
  return null;
}

/* The person who has to respond next — the one who didn't propose the
   current amount. */
function turnOf(offer) {
  return offer.last_proposed_by === "offerer" ? "owner" : "offerer";
}

/* Loads an offer the user is part of. Strangers get the same 404 as a
   missing offer, so they can't even tell it exists. */
async function loadOfferFor(executor, offerId, userId, { lock = false } = {}) {
  const [rows] = await executor.execute(
    `SELECT *, (expires_at <= NOW()) AS is_expired FROM offers WHERE id = ? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
    [offerId]
  );
  const offer = rows[0];
  if (!offer) throw httpError("Offer not found.", 404);
  const role = roleOf(offer, userId);
  if (!role) throw httpError("Offer not found.", 404);
  return { offer, role };
}

function assertOpen(offer) {
  if (offer.status === "Pending" && Number(offer.is_expired)) {
    throw httpError("This offer has expired.", 409);
  }
  if (offer.status !== "Pending") {
    throw httpError(`This offer is already ${offer.status.toLowerCase()}.`, 409);
  }
}

async function userName(userId) {
  const [rows] = await pool.execute(`SELECT full_name FROM users WHERE id = ? LIMIT 1`, [userId]);
  return rows[0]?.full_name || "A student";
}

async function notifyOther({ offer, actorRole, title, message, email = false }) {
  const recipient = actorRole === "offerer" ? offer.owner_id : offer.offerer_id;
  await notificationService.createNotification({
    userId: recipient,
    title,
    message,
    contextType: offer.context_type === "sales_item" ? "sales_item" : "task",
    contextId: offer.context_id,
    email
  });
}

/* ── Reading ─────────────────────────────────────────────────────────── */

function offerView(row, history, viewerId) {
  const role = roleOf(row, viewerId);
  const isOpen = row.status === "Pending";
  const turn = turnOf(row);
  const roundsLeft = Math.max(0, NEGOTIATION.maxCounterRounds - Number(row.counter_rounds));
  const yourTurn = isOpen && role === turn;
  const amount = Number(row.amount);

  return {
    id: row.id,
    context_type: row.context_type,
    context_id: row.context_id,
    status: row.status,
    amount,
    message: row.message,
    my_role: role,
    last_proposed_by: row.last_proposed_by,
    waiting_for: isOpen ? turn : null,
    counter_rounds: Number(row.counter_rounds),
    rounds_left: roundsLeft,
    expires_in_seconds: isOpen ? Math.max(0, Number(row.seconds_left)) : null,
    can_accept: yourTurn,
    can_counter: yourTurn && roundsLeft > 0,
    can_decline: isOpen && role === "owner",
    can_withdraw: isOpen && role === "offerer",
    /* What accepting would mean in money (sales: buyer pays the
       protection fee on top of the agreed price). */
    payment_preview: row.context_type === "sales_item"
      ? salesService.paymentRulesFor(amount, { forceProtection: true })
      : { demo: true, total: amount },
    offerer: {
      id: row.offerer_id,
      name: row.offerer_name,
      photo: row.offerer_photo
    },
    history: history.map(h => ({
      amount: Number(h.amount),
      proposed_by: h.proposed_by,
      message: h.message,
      created_at: h.created_at
    })),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function fetchOfferViews(whereSql, params, viewerId) {
  const [rows] = await pool.execute(
    `SELECT o.*, u.full_name AS offerer_name, u.profile_photo_url AS offerer_photo,
            TIMESTAMPDIFF(SECOND, NOW(), o.expires_at) AS seconds_left
     FROM offers o
     INNER JOIN users u ON u.id = o.offerer_id
     WHERE ${whereSql}
     ORDER BY (o.status = 'Pending') DESC, o.updated_at DESC, o.id DESC`,
    params
  );
  if (!rows.length) return [];

  const ids = rows.map(r => r.id);
  const [historyRows] = await pool.execute(
    `SELECT offer_id, amount, proposed_by, message, created_at
     FROM offer_history WHERE offer_id IN (${ids.map(() => "?").join(",")})
     ORDER BY id ASC`,
    ids
  );
  return rows.map(row => offerView(row, historyRows.filter(h => h.offer_id === row.id), viewerId));
}

async function getOfferView(offerId, viewerId) {
  const [view] = await fetchOfferViews("o.id = ?", [offerId], viewerId);
  return view;
}

/* GET /offers?contextType=&contextId= — the owner sees every negotiation
   on their listing; anyone else sees only their own. Also returns the
   rules the "Make an offer" form needs (allowed range, etc.). */
async function listOffersForListing({ contextType, contextId, viewerId }) {
  const cfg = contextConfig(contextType);
  const listing = await loadListing(pool, contextType, contextId);
  assertVisibleListing(listing, contextType, viewerId);

  await expireStaleOffers(pool, { contextType, contextId });

  const isOwner = Number(listing.owner_id) === Number(viewerId);
  const offers = isOwner
    ? await fetchOfferViews("o.context_type = ? AND o.context_id = ?", [contextType, contextId], viewerId)
    : await fetchOfferViews("o.context_type = ? AND o.context_id = ? AND o.offerer_id = ?", [contextType, contextId, viewerId], viewerId);

  let blockReason = offerBlockReason(listing, contextType, viewerId);
  if (!blockReason && offers.some(o => o.status === "Pending" && o.my_role === "offerer")) {
    blockReason = "You already have an open offer here. Wait for a reply, or withdraw it first.";
  }

  const range = amountRange(contextType, listing.price);
  return {
    my_role: isOwner ? "owner" : "buyer_or_worker",
    offers,
    rules: {
      demo: true,
      listed_price: range.listed,
      min_amount: range.min,
      max_amount: range.max,
      max_counter_rounds: NEGOTIATION.maxCounterRounds,
      expiry_hours: NEGOTIATION.offerExpiryHours,
      message_max_length: NEGOTIATION.messageMaxLength,
      can_make_offer: !blockReason,
      reason: blockReason,
      ...(contextType === "sales_item" ? { protection_fee_percent: SALES.protectionFeePercent } : {}),
      noun: cfg.noun
    }
  };
}

/* ── Actions ─────────────────────────────────────────────────────────── */

async function createOffer({ contextType, contextId, offererId, amount, message }) {
  const cfg = contextConfig(contextType);
  const connection = await pool.getConnection();
  let offerId, listing, cleanAmount;
  try {
    await connection.beginTransaction();

    /* Locking the listing row means two offers from the same person can't
       both slip in at the same moment — the second one waits here, then
       sees the first. */
    listing = await loadListing(connection, contextType, contextId, { lock: true });
    assertVisibleListing(listing, contextType, offererId);
    if (listing.moderation_status !== "clean") throw httpError(`This ${cfg.noun} isn't open for offers right now.`, 409);

    const blockReason = offerBlockReason(listing, contextType, offererId);
    if (blockReason) throw httpError(blockReason, 400);

    await expireStaleOffers(connection, { contextType, contextId });
    const [open] = await connection.execute(
      `SELECT id FROM offers
       WHERE context_type = ? AND context_id = ? AND offerer_id = ? AND status = 'Pending' LIMIT 1`,
      [contextType, contextId, offererId]
    );
    if (open.length) {
      throw httpError("You already have an open offer here. Wait for a reply, or withdraw it first.", 409);
    }

    cleanAmount = parseAmount(amount, amountRange(contextType, listing.price));
    const note = cleanMessage(message);

    const [result] = await connection.execute(
      `INSERT INTO offers (
         context_type, context_id, offerer_id, owner_id, amount, message,
         last_proposed_by, counter_rounds, status, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'offerer', 0, 'Pending', NOW() + INTERVAL ? HOUR)`,
      [contextType, contextId, offererId, listing.owner_id, cleanAmount, note, NEGOTIATION.offerExpiryHours]
    );
    offerId = result.insertId;

    await connection.execute(
      `INSERT INTO offer_history (offer_id, amount, proposed_by, message) VALUES (?, ?, 'offerer', ?)`,
      [offerId, cleanAmount, note]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const name = await userName(offererId);
  await notificationService.createNotification({
    userId: listing.owner_id,
    title: "New Offer",
    message: `${name} offered R${cleanAmount.toFixed(2)} on your ${cfg.noun} "${listing.title}" (listed at R${Number(listing.price).toFixed(2)}). Accept, counter or decline it on the ${cfg.noun} page.`,
    contextType: contextType === "sales_item" ? "sales_item" : "task",
    contextId
  });

  return getOfferView(offerId, offererId);
}

async function counterOffer({ offerId, userId, amount, message }) {
  await expireStaleOffers(pool, { offerId });

  const connection = await pool.getConnection();
  let offer, role, cleanAmount, listing;
  try {
    await connection.beginTransaction();

    ({ offer, role } = await loadOfferFor(connection, offerId, userId, { lock: true }));
    assertOpen(offer);
    if (role !== turnOf(offer)) throw httpError("It's the other person's turn to respond.", 409);
    if (Number(offer.counter_rounds) >= NEGOTIATION.maxCounterRounds) {
      throw httpError(`No counter-offers left (limit is ${NEGOTIATION.maxCounterRounds}). Accept or decline this amount.`, 409);
    }

    /* Plain read (no lock) — the listing is only checked here; accepting
       re-checks everything under a lock. */
    listing = await loadListing(connection, offer.context_type, offer.context_id);
    const cfg = contextConfig(offer.context_type);
    if (listing.status !== cfg.openStatus || listing.moderation_status !== "clean") {
      throw httpError(`This ${cfg.noun} is no longer open for offers.`, 409);
    }

    cleanAmount = parseAmount(amount, amountRange(offer.context_type, listing.price));
    if (cleanAmount === roundMoney(offer.amount)) {
      throw httpError("That's the same amount. Accept it instead, or counter with a different amount.", 400);
    }
    const note = cleanMessage(message);

    await connection.execute(
      `UPDATE offers
       SET amount = ?, last_proposed_by = ?, counter_rounds = counter_rounds + 1,
           expires_at = NOW() + INTERVAL ? HOUR
       WHERE id = ?`,
      [cleanAmount, role, NEGOTIATION.offerExpiryHours, offerId]
    );
    await connection.execute(
      `INSERT INTO offer_history (offer_id, amount, proposed_by, message) VALUES (?, ?, ?, ?)`,
      [offerId, cleanAmount, role, note]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const name = await userName(userId);
  const roundsLeft = NEGOTIATION.maxCounterRounds - Number(offer.counter_rounds) - 1;
  await notifyOther({
    offer, actorRole: role,
    title: "Counter-Offer",
    message: `${name} countered with R${cleanAmount.toFixed(2)} on "${listing.title}".${roundsLeft > 0 ? "" : " That was the last counter — you can accept or decline it."}`
  });

  return getOfferView(offerId, userId);
}

async function closeOffer({ offerId, userId, action }) {
  const newStatus = action === "decline" ? "Declined" : "Withdrawn";
  const allowedRole = action === "decline" ? "owner" : "offerer";

  await expireStaleOffers(pool, { offerId });

  const connection = await pool.getConnection();
  let offer, role;
  try {
    await connection.beginTransaction();
    ({ offer, role } = await loadOfferFor(connection, offerId, userId, { lock: true }));
    if (role !== allowedRole) {
      throw httpError(action === "decline"
        ? "Only the listing owner can decline an offer."
        : "Only the person who made the offer can withdraw it.", 403);
    }
    assertOpen(offer);
    await connection.execute(`UPDATE offers SET status = ? WHERE id = ?`, [newStatus, offerId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const listing = await loadListing(pool, offer.context_type, offer.context_id);
  const name = await userName(userId);
  await notifyOther({
    offer, actorRole: role,
    title: action === "decline" ? "Offer Declined" : "Offer Withdrawn",
    message: action === "decline"
      ? `${name} declined your offer of R${Number(offer.amount).toFixed(2)} on "${listing.title}".`
      : `${name} withdrew their offer on "${listing.title}".`
  });

  return getOfferView(offerId, userId);
}

/* expectedAmount is the amount the person saw on screen when they pressed
   Accept. If the other side countered in the meantime, the accept is
   refused instead of agreeing to a number they never saw. */
async function acceptOffer({ offerId, userId, expectedAmount }) {
  await expireStaleOffers(pool, { offerId });

  const { offer: peek, role } = await loadOfferFor(pool, offerId, userId);
  assertOpen(peek);
  if (role !== turnOf(peek)) throw httpError("It's the other person's turn to respond.", 409);

  const agreed = roundMoney(expectedAmount);
  if (!Number.isFinite(agreed) || agreed !== roundMoney(peek.amount)) {
    throw httpError(`The amount on this offer is now R${Number(peek.amount).toFixed(2)}. Please check it before accepting.`, 409);
  }

  /* Runs inside the task/sale transaction, AFTER the listing row is
     locked (see the locking-order note at the top). Re-checks the offer
     under its own lock, then marks it Accepted — if anything here fails,
     the whole accept is rolled back. */
  const lockAndAcceptOffer = async (connection, listingRow) => {
    if (listingRow.moderation_status && listingRow.moderation_status !== "clean") {
      throw httpError("This listing isn't open for offers right now.", 409);
    }
    const { offer } = await loadOfferFor(connection, offerId, userId, { lock: true });
    assertOpen(offer);
    if (role !== turnOf(offer)) throw httpError("It's the other person's turn to respond.", 409);
    if (roundMoney(offer.amount) !== agreed) {
      throw httpError(`The amount on this offer is now R${Number(offer.amount).toFixed(2)}. Please check it before accepting.`, 409);
    }
    await connection.execute(`UPDATE offers SET status = 'Accepted' WHERE id = ?`, [offerId]);
  };

  let result;
  if (peek.context_type === "task") {
    /* The poster pays. Whether the poster accepted the student's offer or
       the student accepted the poster's counter, this is the moment the
       poster's (demo) payment is held and the task is assigned. */
    const task = await taskService.acceptTask(peek.context_id, peek.offerer_id, {
      agreedPrice: agreed,
      beforeCommit: lockAndAcceptOffer,
      notify: false
    });
    result = { task };
  } else {
    /* The buyer pays. The item is reserved for them at the agreed price
       and their (demo) payment is held with a handover code — the normal
       Taskify Protection flow takes it from there. */
    const { order } = await salesService.buySalesItem(peek.context_id, peek.offerer_id, {
      agreedPrice: agreed,
      beforeCommit: lockAndAcceptOffer
    });
    /* The order view holds the buyer's secret handover code — only hand
       it back if the person accepting IS the buyer. */
    result = { order: role === "offerer" ? order : null };
  }

  const listing = await loadListing(pool, peek.context_type, peek.context_id);
  const name = await userName(userId);
  const nextStep = peek.context_type === "task"
    ? (role === "owner"
        ? "The task is now assigned to you and the poster's payment is held (demo)."
        : "The task is now assigned to them and your payment is held (demo).")
    : (role === "owner"
        ? "The item is reserved for you and your payment is held (demo). Your handover code is on the item page."
        : "The item is reserved for them and their payment is held (demo). Ask for their handover code when you meet.");
  await notifyOther({
    offer: peek, actorRole: role,
    title: "Offer Accepted",
    message: `${name} accepted R${agreed.toFixed(2)} for "${listing.title}". ${nextStep}`,
    email: true
  });

  return { offer: await getOfferView(offerId, userId), ...result };
}

module.exports = {
  listOffersForListing,
  createOffer,
  counterOffer,
  acceptOffer,
  declineOffer: ({ offerId, userId }) => closeOffer({ offerId, userId, action: "decline" }),
  withdrawOffer: ({ offerId, userId }) => closeOffer({ offerId, userId, action: "withdraw" })
};
