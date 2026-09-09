const webpush = require("web-push");
const pool = require("../config/db");
const { hashToken } = require("../utils/crypto");

/*
  Real browser push — a notification that reaches the user even with the
  Taskify tab (or the whole browser) closed, via the Web Push API. This is
  distinct from the existing in-app notifications (polled every 30s,
  page-open only) and the email shortlist in mailer.service.js — this is
  the third, "wherever the person actually is" channel the stakeholder
  originally asked for.

  VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY identify this server to push
  services (FCM, Mozilla's push service, etc.) so they'll accept pushes
  from it — generate once with `node scripts/generate-vapid-keys.js` (or
  any RFC 8292-compliant generator) and set as env vars, never regenerate
  casually: doing so invalidates every subscription already stored, since
  each one is tied to the public key it was created with.
*/

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || "mailto:jagetsa6@gmail.com";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

/* Public key is not secret — it's handed to every logged-in browser so it
   can create a subscription tied to it. Returns null (rather than
   throwing) when VAPID env vars aren't set yet, so the frontend can just
   skip subscribing instead of erroring. */
function getPublicKey() {
  return VAPID_PUBLIC_KEY || null;
}

async function saveSubscription(userId, subscription) {
  const endpoint = subscription?.endpoint;
  const p256dh   = subscription?.keys?.p256dh;
  const auth     = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    const error = new Error("Invalid push subscription payload.");
    error.statusCode = 400;
    throw error;
  }

  const endpointHash = hashToken(endpoint);

  /* One row per browser/device. Re-subscribing the same endpoint (e.g. the
     page re-registers on every load) just refreshes the keys and owner
     instead of piling up duplicate rows. */
  await pool.execute(
    `INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [userId, endpoint, endpointHash, p256dh, auth]
  );
}

async function removeSubscription(userId, endpoint) {
  if (!endpoint) return;
  await pool.execute(
    `DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?`,
    [userId, hashToken(endpoint)]
  );
}

/*
  Fire-and-forget, same shape as notification.service.js's maybeSendEmail:
  never awaited by callers, so a slow or unreachable push service can
  never add latency to (or fail) the request that triggered the
  notification. Sends to every device the user has subscribed on.
*/
async function sendPushToUser(userId, { title, message, url = null }) {
  if (!ensureConfigured()) return; // VAPID keys not set on this environment yet — push silently disabled

  try {
    const [subs] = await pool.execute(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`,
      [userId]
    );
    if (!subs.length) return;

    const payload = JSON.stringify({
      title,
      body: message,
      url: url || "./notifications.html"
    });

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (error) {
        /* 404/410 = the browser or OS has permanently discarded this
           subscription (uninstalled, permission revoked, etc.) — clean it
           up so every future notification doesn't keep re-trying a dead
           endpoint. Any other error (a transient network blip) is logged
           and left alone. */
        if (error.statusCode === 404 || error.statusCode === 410) {
          await pool.execute(`DELETE FROM push_subscriptions WHERE id = ?`, [sub.id]).catch(() => {});
        } else {
          console.error("[push] Failed to deliver push notification, continuing:", error.message);
        }
      }
    }));
  } catch (error) {
    console.error("[push] sendPushToUser failed, continuing without it:", error.message);
  }
}

module.exports = {
  getPublicKey,
  saveSubscription,
  removeSubscription,
  sendPushToUser
};
