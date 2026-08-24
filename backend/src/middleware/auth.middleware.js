const jwt = require("jsonwebtoken");
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    /*
      Re-check the user's CURRENT role AND member_type on every request
      instead of trusting the token — this is what makes suspend/ban take
      effect immediately, and (new) makes lecturer-only routes reflect the
      account's real identity rather than a possibly-stale token claim.
    */
    const [rows] = await pool.execute(
      `SELECT role, member_type, suspension_reason, ban_reason FROM users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Unauthorized. Account no longer exists." });
    }

    const { role: currentRole, member_type: currentMemberType, suspension_reason, ban_reason } = rows[0];

    if (currentRole === "suspended") {
      const reasonText = suspension_reason ? ` Reason: ${suspension_reason}` : "";
      return res.status(403).json({ success: false, message: `Your account has been suspended.${reasonText}` });
    }
    if (currentRole === "banned") {
      const reasonText = ban_reason ? ` Reason: ${ban_reason}` : "";
      return res.status(403).json({ success: false, message: `Your account has been banned.${reasonText}` });
    }

    req.user = { ...decoded, role: currentRole, memberType: currentMemberType };
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

module.exports = {
  authenticate,
  authorize,
  requireLecturer
};