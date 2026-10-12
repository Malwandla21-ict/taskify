const pool = require("../config/db");
const { SALES, RENTALS } = require("../config/paymentSettings");
const { expireStaleBookingRequests } = require("./equipment.service");
const { overdueRentalsByItem } = require("./rentalCore.service");

/*
  Action Centre ("Waiting for you") — every open transaction the user is
  part of (tasks, offers, sales orders, rentals), split into what needs
  THEM next and what's waiting on someone else.

  Read-only: nothing here changes data. Each item describes its one main
  next step; the actual step still goes through its own endpoint, which
  checks permissions and state on the server as before. Inline actions
  ("api") are only offered for simple one-click steps; anything needing
  more input (a handover code, photos, a counter-offer) links ("link") to
  the page where that happens.

  Item shape:
    { key, kind, title, href, role, status, tone, nextBy, step,
      deadline, deadlineLabel, overdue, amount, payment, action, secondaryAction }
  tone: "action" (you) | "waiting" (someone else) | "problem"
*/

const money = (n) => (n == null ? null : Number(n));

/* "2026-10-11" → "Sun 11 Oct" for the plain-language step text. */
function prettyDate(dateText) {
  const d = new Date(`${dateText}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateText;
  return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");
}

async function taskItems(userId) {
  const [rows] = await pool.execute(
    `SELECT t.id, t.title, t.status, t.price, t.created_by, t.accepted_by, t.updated_at,
            p.status AS payment_status,
            poster.full_name AS poster_name, worker.full_name AS worker_name
     FROM tasks t
     LEFT JOIN payments p ON p.task_id = t.id
     LEFT JOIN users poster ON poster.id = t.created_by
     LEFT JOIN users worker ON worker.id = t.accepted_by
     WHERE t.status IN ('Accepted', 'In Progress', 'Awaiting Confirmation', 'Disputed')
       AND (t.created_by = ? OR t.accepted_by = ?)`,
    [userId, userId]
  );

  return rows.map((t) => {
    const isPoster = Number(t.created_by) === Number(userId);
    const base = {
      key: `task-${t.id}`, kind: "task", title: t.title,
      href: `./task-details.html?id=${t.id}`,
      role: isPoster ? "Task you posted" : "Task you're doing",
      amount: money(t.price),
      payment: t.payment_status ? `Payment ${t.payment_status.toLowerCase()} (demo)` : null,
      deadline: null, deadlineLabel: null, overdue: false,
      updatedAt: t.updated_at
    };
    const worker = t.worker_name || "The worker";
    const poster = t.poster_name || "The poster";

    if (t.status === "Accepted") {
      return isPoster
        ? { ...base, status: "Assigned", tone: "waiting", nextBy: worker,
            step: `${worker} accepted it. Waiting for them to start.` }
        : { ...base, status: "Ready to start", tone: "action", nextBy: "you",
            step: "Start the task when you begin the work.",
            action: { type: "api", label: "Start task", method: "PATCH", endpoint: `/tasks/${t.id}/status`,
                      body: { status: "In Progress" }, success: "Task started." } };
    }
    if (t.status === "In Progress") {
      return isPoster
        ? { ...base, status: "In progress", tone: "waiting", nextBy: worker,
            step: `${worker} is working on it. You'll be asked to confirm once it's done.` }
        : { ...base, status: "In progress", tone: "action", nextBy: "you",
            step: "Mark it as done when you've finished, so the poster can review it.",
            action: { type: "api", label: "Mark as done", method: "PATCH", endpoint: `/tasks/${t.id}/status`,
                      body: { status: "Awaiting Confirmation" }, success: "Marked as done. The poster has been asked to confirm.",
                      confirm: "Mark this task as done? The poster will be asked to check the work and confirm." } };
    }
    if (t.status === "Disputed") {
      return isPoster
        ? { ...base, status: "Problem reported", tone: "problem", nextBy: "Taskify admin",
            step: "You reported a problem with the work. An admin will decide; the payment stays held. You can still confirm if it gets sorted out." }
        : { ...base, status: "Problem reported", tone: "problem", nextBy: "Taskify admin",
            step: `${poster} reported a problem with the work. The payment stays held while an admin looks at it. Message them to sort it out.` };
    }
    /* Awaiting Confirmation */
    return isPoster
      ? { ...base, status: "Awaiting your confirmation", tone: "action", nextBy: "you",
          step: `${worker} marked it as done. Check the work, then confirm to release the payment, or report a problem if it isn't done properly.`,
          action: { type: "api", label: "Confirm & release payment", method: "PATCH",
                    endpoint: `/tasks/${t.id}/confirm-completion`, moment: "released",
                    success: `Task completed. Payment released to ${worker}.`,
                    confirm: "Confirm this task is complete? This releases the payment to the worker." },
          secondaryAction: { type: "link", label: "Report a problem", href: `${base.href}#report-problem` } }
      : { ...base, status: "Awaiting confirmation", tone: "waiting", nextBy: poster,
          step: `You marked it as done. Waiting for ${poster} to confirm and release your payment.` };
  });
}

async function offerItems(userId) {
  const [rows] = await pool.execute(
    `SELECT o.id, o.context_type, o.context_id, o.offerer_id, o.owner_id, o.amount,
            o.last_proposed_by, o.counter_rounds, o.expires_at, o.updated_at,
            offerer.full_name AS offerer_name, owner.full_name AS owner_name,
            COALESCE(t.title, si.title) AS listing_title, t.price AS task_price
     FROM offers o
     INNER JOIN users offerer ON offerer.id = o.offerer_id
     INNER JOIN users owner ON owner.id = o.owner_id
     LEFT JOIN tasks t ON o.context_type = 'task' AND t.id = o.context_id
     LEFT JOIN sales_items si ON o.context_type = 'sales_item' AND si.id = o.context_id
     WHERE o.status = 'Pending'
       AND (o.expires_at IS NULL OR o.expires_at > NOW())
       AND (o.offerer_id = ? OR o.owner_id = ?)`,
    [userId, userId]
  );

  return rows.map((o) => {
    const isOwner = Number(o.owner_id) === Number(userId);
    const turn = o.last_proposed_by === "offerer" ? "owner" : "offerer";
    const myTurn = (isOwner ? "owner" : "offerer") === turn;
    const other = isOwner ? (o.offerer_name || "The other student") : (o.owner_name || "The other student");
    const isTask = o.context_type === "task";
    const href = isTask ? `./task-details.html?id=${o.context_id}` : `./sale-details.html?id=${o.context_id}`;
    const amount = `R${Number(o.amount).toFixed(2)}`;
    /* An untouched offer at a task's listed price is an application
       ("Apply for this task") — the poster chooses who does each task. */
    const isApplication = isTask && Number(o.counter_rounds) === 0
      && Math.abs(Number(o.amount) - Number(o.task_price)) < 0.005;
    const base = {
      key: `offer-${o.id}`, kind: "offer", title: o.listing_title || "Offer", href,
      role: isApplication
        ? (isOwner ? "Application for your task" : "Your application")
        : isOwner ? (isTask ? "Offer on your task" : "Offer on your item") : (isTask ? "Your offer on a task" : "Your offer on an item"),
      amount: money(o.amount), payment: null,
      deadline: o.expires_at, deadlineLabel: myTurn ? "Respond by" : "Expires", overdue: false,
      updatedAt: o.updated_at
    };
    if (isApplication) {
      return myTurn
        ? { ...base, status: "Choose a worker", tone: "action", nextBy: "you",
            step: `${other} applied to do it at your price of ${amount}. Accept to assign them (your payment is held), or decline.`,
            action: { type: "link", label: "Review applicants", href } }
        : { ...base, status: "Applied", tone: "waiting", nextBy: other,
            step: `You applied at ${amount}. Waiting for ${other} to choose who does it.` };
    }
    return myTurn
      ? { ...base, status: "Your turn to respond", tone: "action", nextBy: "you",
          step: `${other} proposed ${amount}. Accept, counter or decline.`,
          action: { type: "link", label: "Respond to offer", href } }
      : { ...base, status: "Waiting for a reply", tone: "waiting", nextBy: other,
          step: `You proposed ${amount}. Waiting for ${other} to respond.` };
  });
}

async function saleItems(userId) {
  const [rows] = await pool.execute(
    `SELECT so.id, so.sales_item_id, so.buyer_id, so.seller_id, so.item_price, so.total_amount,
            so.code_attempts, so.updated_at, so.status, so.disputed_by, si.title,
            buyer.full_name AS buyer_name, seller.full_name AS seller_name
     FROM sale_orders so
     INNER JOIN sales_items si ON si.id = so.sales_item_id
     LEFT JOIN users buyer ON buyer.id = so.buyer_id
     LEFT JOIN users seller ON seller.id = so.seller_id
     WHERE so.status IN ('Held', 'Disputed') AND (so.buyer_id = ? OR so.seller_id = ?)`,
    [userId, userId]
  );

  return rows.map((s) => {
    const isBuyer = Number(s.buyer_id) === Number(userId);
    const locked = Number(s.code_attempts) >= SALES.maxCodeAttempts;
    const href = `./sale-details.html?id=${s.sales_item_id}`;
    const base = {
      key: `sale-${s.id}`, kind: "sale", title: s.title, href,
      role: isBuyer ? "Item you're buying" : "Item you're selling",
      amount: money(isBuyer ? s.total_amount : s.item_price),
      payment: "Payment held (demo)",
      deadline: null, deadlineLabel: null, overdue: false,
      updatedAt: s.updated_at
    };
    const seller = s.seller_name || "The seller";
    const buyer = s.buyer_name || "The buyer";

    /* A problem was reported (meetup failed / handover went wrong): the
       money stays held until it's sorted out or an admin decides. */
    if (s.status === "Disputed") {
      const iReported = s.disputed_by === (isBuyer ? "buyer" : "seller");
      return isBuyer
        ? { ...base, status: "Problem reported", tone: "problem", nextBy: "Taskify admin",
            step: `${iReported ? "You" : seller} reported a problem. Your money stays held while an admin looks at it. If you meet and sort it out, show your code as normal.`,
            action: { type: "link", label: "View order", href } }
        : { ...base, status: "Problem reported", tone: "problem", nextBy: "Taskify admin",
            step: `${iReported ? "You" : buyer} reported a problem. The money stays held while an admin looks at it. If you meet and sort it out, enter the buyer's code as normal.`,
            action: { type: "link", label: "View order", href } };
    }

    if (locked) {
      return isBuyer
        ? { ...base, status: "Handover locked", tone: "problem", nextBy: "you",
            step: "Too many wrong codes were entered. If you didn't get the item, cancel the order for a refund.",
            action: { type: "link", label: "Cancel & get refund", href } }
        : { ...base, status: "Handover locked", tone: "problem", nextBy: buyer,
            step: `Too many wrong codes were entered, so the order is locked. ${buyer} can cancel it for a refund, or you can report a problem for an admin to sort out.`,
            action: { type: "link", label: "Report a problem", href } };
    }
    return isBuyer
      ? { ...base, status: "Meet the seller", tone: "action", nextBy: "you",
          step: `Arrange a meetup with ${seller}. Check the item first, then show them your handover code.`,
          action: { type: "link", label: "View handover code", href } }
      : { ...base, status: "Meet the buyer", tone: "action", nextBy: "you",
          step: `Arrange a meetup with ${buyer}. Once they've checked the item, enter their 4-digit code to get paid.`,
          action: { type: "link", label: "Enter handover code", href } };
  });
}

async function rentalItems(userId) {
  await expireStaleBookingRequests();
  const [rows] = await pool.execute(
    `SELECT eb.id, eb.equipment_id, eb.renter_id, eb.status, eb.created_at, eb.updated_at,
            DATE_FORMAT(eb.start_date, '%Y-%m-%d') AS start_text,
            DATE_FORMAT(eb.end_date, '%Y-%m-%d') AS end_text,
            eb.picked_up_at, eb.condition_status, eb.payment_status, eb.payment_status IS NULL AS legacy,
            eb.payment_due_at, eb.return_due_at, eb.return_reported_at, eb.return_disputed_at,
            eb.rental_amount, eb.protection_fee, eb.deposit_amount,
            x.status AS extension_status, DATE_FORMAT(x.new_end_date, '%Y-%m-%d') AS extension_end,
            x.extra_amount AS extension_amount, x.extra_fee AS extension_fee, x.payment_due_at AS extension_due_at,
            e.name, e.owner_id, renter.full_name AS renter_name, owner.full_name AS owner_name
     FROM equipment_bookings eb
     INNER JOIN equipment e ON e.id = eb.equipment_id
     LEFT JOIN users renter ON renter.id = eb.renter_id
     LEFT JOIN users owner ON owner.id = e.owner_id
     LEFT JOIN booking_extensions x ON x.booking_id = eb.id AND x.status IN ('Requested', 'Awaiting Payment')
     WHERE (e.owner_id = ? OR eb.renter_id = ?)
       AND (eb.status IN ('Pending', 'Awaiting Payment', 'Confirmed')
            OR (eb.status = 'Returned' AND eb.condition_status = 'Pending'))`,
    [userId, userId]
  );

  const now = new Date();
  const historyHref = "./equipment.html#history";
  /* Items still overdue with someone else — the next renter has to wait. */
  const overdueItems = await overdueRentalsByItem(pool, rows
    .filter((b) => ["Awaiting Payment", "Confirmed"].includes(b.status) && !b.picked_up_at && !b.legacy)
    .map((b) => b.equipment_id));

  return rows.map((b) => {
    const late = overdueItems.get(Number(b.equipment_id));
    const itemNotBack = !!late && late.bookingId !== Number(b.id) && !b.picked_up_at && !b.legacy;
    const isOwner = Number(b.owner_id) === Number(userId);
    const renter = b.renter_name || "The renter";
    const owner = b.owner_name || "The owner";
    const total = b.rental_amount == null ? null
      : Number(b.rental_amount) + Number(b.protection_fee || 0) + Number(b.deposit_amount || 0);
    const paymentText = {
      Unpaid: "Not paid yet", Held: "Payment held (demo)", Released: "Payment released (demo)", Refunded: "Refunded (demo)"
    }[b.payment_status] || null;
    const base = {
      key: `rental-${b.id}`, kind: "rental", title: b.name, href: historyHref,
      role: isOwner ? "Your equipment" : "Equipment you're renting",
      amount: isOwner ? money(b.rental_amount) : total,
      payment: paymentText,
      deadline: null, deadlineLabel: null, overdue: false,
      updatedAt: b.updated_at,
      dates: { start: b.start_text, end: b.end_text }
    };

    if (b.status === "Pending") {
      const expires = new Date(new Date(b.created_at).getTime() + RENTALS.requestExpiryHours * 3600 * 1000).toISOString();
      const paidUpFront = b.payment_status === "Held";
      return isOwner
        ? { ...base, status: "Booking request", tone: "action", nextBy: "you",
            step: `${renter} wants it from ${prettyDate(b.start_text)} to ${prettyDate(b.end_text)}. ${paidUpFront ? "Approve or decline" : "Approve and they'll be asked to pay, or decline"} before the request expires.`,
            deadline: expires, deadlineLabel: "Respond by",
            action: { type: "api", label: "Approve booking", method: "PATCH", endpoint: `/equipment/bookings/${b.id}/confirm`,
                      success: paidUpFront ? `Booking confirmed. ${renter} has been told.` : `Approved. ${renter} has been asked to pay.` },
            secondaryAction: { type: "api", label: "Decline", method: "PATCH", endpoint: `/equipment/bookings/${b.id}/decline`,
                               success: "Booking declined. The renter has been told.",
                               confirm: "Decline this booking request?" } }
        : { ...base, status: "Waiting for approval", tone: "waiting", nextBy: owner,
            step: `Waiting for ${owner} to approve your request. You'll pay only once it's approved.`,
            deadline: expires, deadlineLabel: "Expires" };
    }

    if (b.status === "Awaiting Payment") {
      return isOwner
        ? { ...base, status: "Waiting for payment", tone: "waiting", nextBy: renter,
            step: `You approved it. Waiting for ${renter} to pay (demo) — if they don't in time, the dates are released.`,
            deadline: b.payment_due_at, deadlineLabel: "Pay by" }
        : { ...base, status: "Approved — pay to confirm", tone: "action", nextBy: "you",
            step: `${owner} approved your request. Review the terms and pay (demo) to confirm the booking.${itemNotBack ? " Heads-up: the item hasn't come back from the previous rental yet." : ""}`,
            deadline: b.payment_due_at, deadlineLabel: "Pay by",
            action: { type: "link", label: "Review & pay", href: historyHref } };
    }

    if (b.status === "Confirmed" && !b.picked_up_at && !b.legacy && itemNotBack) {
      return isOwner
        ? { ...base, status: "Waiting for return", tone: "problem", nextBy: "you",
            step: `${renter} is booked from ${prettyDate(b.start_text)}, but the previous renter hasn't returned it yet. Record its return when you have it — or, if you can't hand it over in time, cancel and ${renter} is refunded in full (demo).`,
            deadline: b.start_text, deadlineLabel: "Collection from",
            action: { type: "link", label: "Open rental", href: historyHref },
            secondaryAction: { type: "api", label: "Can't hand it over", method: "PATCH", endpoint: `/equipment/bookings/${b.id}/owner-cancel`,
                               body: { note: "The item wasn't back from the previous rental in time." },
                               success: `Booking cancelled. ${renter} has been refunded in full (demo).`,
                               confirm: `Cancel ${renter}'s booking? They'll get a full refund (demo).` } }
        : { ...base, status: "Waiting for the item", tone: "problem", nextBy: owner,
            step: `The previous renter hasn't returned it yet, so it may not be ready on ${prettyDate(b.start_text)}. The owner has been told and we'll let you know when it's back — or cancel now for a full refund (demo).`,
            deadline: b.start_text, deadlineLabel: "Collection from",
            action: { type: "api", label: "Cancel (full refund)", method: "PATCH", endpoint: `/equipment/bookings/${b.id}/cancel`,
                      success: "Booking cancelled. You've been refunded in full (demo).",
                      confirm: "Cancel this booking? You'll get a full refund (demo)." } };
    }

    if (b.status === "Confirmed" && !b.picked_up_at && !b.legacy) {
      return isOwner
        ? { ...base, status: "Ready for collection", tone: "waiting", nextBy: renter,
            step: `Hand the item to ${renter}. They'll confirm pickup with photos of its condition.`,
            deadline: b.start_text, deadlineLabel: "Collection from" }
        : { ...base, status: "Ready for collection", tone: "action", nextBy: "you",
            step: `Collect it from ${owner}, then confirm pickup with photos of its condition.`,
            deadline: b.start_text, deadlineLabel: "Collection from",
            action: { type: "link", label: "Confirm pickup", href: historyHref } };
    }

    if (b.status === "Confirmed") {
      /* Out on rent (collected, or a legacy booking) until it's returned. */
      const due = b.return_due_at ? new Date(b.return_due_at) : null;
      const overdue = !!due && due < now;
      const dueSoon = !overdue && !!due && due - now <= RENTALS.returnReminderHours * 3600 * 1000;
      const deadlineBits = { deadline: b.return_due_at, deadlineLabel: "Return by", overdue };

      /* The renter said they've handed it back: the owner confirms (that
         completes the rental and releases the rent) or says they don't
         have it, and an admin decides. */
      if (b.return_reported_at && b.return_disputed_at) {
        return isOwner
          ? { ...base, status: "Return disputed", tone: "problem", nextBy: "Taskify admin",
              step: `You told us you don't have it, though ${renter} says they handed it back. A Taskify admin will decide. If you do get it back, record the return on the rental.`,
              action: { type: "link", label: "Open rental", href: historyHref } }
          : { ...base, status: "Return disputed", tone: "problem", nextBy: "Taskify admin",
              step: `${owner} says they don't have it back. A Taskify admin will compare the photos and decide. If it's still with you, return it and message ${owner}.` };
      }
      if (b.return_reported_at) {
        return isOwner
          ? { ...base, status: "Confirm the return", tone: "action", nextBy: "you",
              step: `${renter} says they've handed it back. If you have it, confirm to complete the rental and get your R${Number(b.rental_amount).toFixed(2)} (demo). If you don't, say so on the rental.`,
              action: { type: "api", label: "Yes, it's back", method: "PATCH", endpoint: `/equipment/bookings/${b.id}/return`, body: {}, moment: "released",
                        success: "Return confirmed. Your rent has been released (demo). Please check the item's condition.",
                        confirm: "Confirm you have the item back? This completes the rental and releases your rent (demo)." },
              secondaryAction: { type: "link", label: "I don't have it", href: historyHref } }
          : { ...base, status: "Waiting for the owner", tone: "waiting", nextBy: owner,
              step: `You said you've handed it back. Waiting for ${owner} to confirm they have it — that completes the rental. If they don't, a Taskify admin will step in.` };
      }

      if (b.extension_status === "Requested") {
        return isOwner
          ? { ...base, ...deadlineBits, status: "Extension request", tone: "action", nextBy: "you",
              step: `${renter} would like to keep it until ${prettyDate(b.extension_end)} (R${Number(b.extension_amount).toFixed(2)} more). Approve and they'll pay the extra, or decline.`,
              action: { type: "api", label: "Approve extension", method: "PATCH", endpoint: `/equipment/bookings/${b.id}/extension/approve`,
                        success: `Extension approved. ${renter} has been asked to pay.` },
              secondaryAction: { type: "api", label: "Decline", method: "PATCH", endpoint: `/equipment/bookings/${b.id}/extension/decline`,
                                 success: "Extension declined. The renter has been told.", confirm: "Decline this extension request?" } }
          : { ...base, ...deadlineBits, status: "Extension requested", tone: "waiting", nextBy: owner,
              step: `You asked to keep it until ${prettyDate(b.extension_end)}. Until ${owner} approves and you pay, the current deadline still applies.` };
      }
      if (b.extension_status === "Awaiting Payment") {
        return isOwner
          ? { ...base, ...deadlineBits, status: "Extension approved", tone: "waiting", nextBy: renter,
              step: `You approved keeping it until ${prettyDate(b.extension_end)}. Waiting for ${renter} to pay the extra.` }
          : { ...base, ...deadlineBits, status: "Pay for extension", tone: "action", nextBy: "you",
              step: `${owner} agreed you can keep it until ${prettyDate(b.extension_end)}. Pay R${(Number(b.extension_amount) + Number(b.extension_fee || 0)).toFixed(2)} (demo) to confirm — until then the current deadline applies.`,
              deadline: b.extension_due_at, deadlineLabel: "Pay by", overdue: false,
              action: { type: "link", label: "Pay for extension", href: historyHref } };
      }

      return isOwner
        ? { ...base, ...deadlineBits, status: overdue ? "Overdue" : "Out on rent", tone: overdue ? "problem" : "waiting", nextBy: renter,
            step: overdue
              ? `${renter} hasn't returned it yet. Message them to arrange the return, or report a problem if they don't respond.`
              : `${renter} has it until the return deadline.` }
        : { ...base, ...deadlineBits, status: overdue ? "Overdue" : dueSoon ? "Return due" : "Rental active",
            tone: overdue ? "problem" : "action", nextBy: "you",
            step: overdue
              ? `This is past its return deadline. Return it to ${owner} as soon as possible.`
              : `Return it to ${owner} with photos of its condition, or ask for an extension before the deadline.`,
            action: { type: "link", label: "Return item", href: historyHref } };
    }

    /* Returned, waiting for the owner's condition check. */
    return isOwner
      ? { ...base, status: "Check condition", tone: "action", nextBy: "you",
          step: `${renter} returned it. Compare the return photos with the pickup photos, then confirm its condition.`,
          action: { type: "link", label: "Check condition", href: historyHref } }
      : { ...base, status: "Being checked", tone: "waiting", nextBy: owner,
          step: `You returned it. Waiting for ${owner} to check its condition.` };
  });
}

/* Soonest deadline first; items without a deadline after, newest first. */
function byUrgency(a, b) {
  const da = a.deadline ? new Date(a.deadline).getTime() : Infinity;
  const db = b.deadline ? new Date(b.deadline).getTime() : Infinity;
  if (a.tone === "problem" && b.tone !== "problem") return -1;
  if (b.tone === "problem" && a.tone !== "problem") return 1;
  if (da !== db) return da - db;
  return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
}

async function getMyActivity(userId) {
  const groups = await Promise.all([taskItems(userId), offerItems(userId), saleItems(userId), rentalItems(userId)]);
  const all = groups.flat();
  const needsYou = all.filter((i) => i.nextBy === "you").sort(byUrgency);
  const waitingOnOthers = all.filter((i) => i.nextBy !== "you").sort(byUrgency);
  return { needsYou, waitingOnOthers, counts: { needsYou: needsYou.length, waitingOnOthers: waitingOnOthers.length } };
}

module.exports = { getMyActivity };
