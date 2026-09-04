const { verifyToken } = require("../utils/jwt");
const pool = require("../config/db");

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Token missing."
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    /*
      Re-check the user's CURRENT role, member_type AND token_version on
      every request instead of trusting the token — this is what makes
      suspend/ban take effect immediately, makes lecturer-only routes
      reflect the account's real identity rather than a possibly-stale
      token claim, and (new) makes a password change/reset immediately
      invalidate every token issued before it, since a stolen token would
      otherwise stay valid until its natural expiry even after the
      password that "backs" it changes.
    */
    const [rows] = await pool.execute(
      `SELECT role, member_type, suspension_reason, ban_reason, token_version, totp_enabled FROM users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Unauthorized. Account no longer exists." });
    }

    const { role: currentRole, member_type: currentMemberType, suspension_reason, ban_reason, token_version, totp_enabled } = rows[0];

    if ((decoded.tv || 0) !== token_version) {
      return res.status(401).json({ success: false, message: "Your session has expired. Please log in again." });
    }

    if (currentRole === "suspended") {
      const reasonText = suspension_reason ? ` Reason: ${suspension_reason}` : "";
      return res.status(403).json({ success: false, message: `Your account has been suspended.${reasonText}` });
    }
    if (currentRole === "banned") {
      const reasonText = ban_reason ? ` Reason: ${ban_reason}` : "";
      return res.status(403).json({ success: false, message: `Your account has been banned.${reasonText}` });
    }

    req.user = { ...decoded, role: currentRole, memberType: currentMemberType, totpEnabled: !!totp_enabled };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized. Invalid token."
    });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden. You do not have access."
      });
    }

    next();
  };
}

/* New: gate lecturer-only endpoints (giving endorsements, searching
   students, etc.) on the account's member_type rather than role, since
   lecturers are ordinary 'user' role for moderation purposes. */
function requireLecturer(req, res, next) {
  if (req.user.memberType !== "Lecturer") {
    return res.status(403).json({ success: false, message: "This action is only available to lecturer accounts." });
  }
  next();
}

/*
  Admin accounts can ban, suspend, refund and promote — the highest-value
  targets in the app. Rather than forcing 2FA at signup (before an admin
  even exists to require it of), this is enforced at the door of the admin
  API itself: an admin who hasn't enabled 2FA yet can still log in and
  reach their own profile settings to turn it on, but can't perform any
  admin action until they do. Place this AFTER authenticate + authorize("admin").
*/
function requireTwoFactor(req, res, next) {
  if (!req.user.totpEnabled) {
    return res.status(403).json({
      success: false,
      message: "Enable two-factor authentication in your profile's Security settings before performing admin actions."
    });
  }
  next();
}

module.exports = {
  authenticate,
  authorize,
  requireLecturer,
  requireTwoFactor
};
