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
      Re-check the user's CURRENT role on every request instead of trusting
      the role baked into the token at login time — this is what makes
      suspend/ban take effect immediately rather than waiting for the
      token to expire. Also pull the reason columns so a user whose
      account changes mid-session (their existing tab is still open) sees
      why, not just that.
    */
    const [rows] = await pool.execute(
      `SELECT role, suspension_reason, ban_reason FROM users WHERE id = ? LIMIT 1`,
      [decoded.id]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Unauthorized. Account no longer exists." });
    }

    const { role: currentRole, suspension_reason, ban_reason } = rows[0];

    if (currentRole === "suspended") {
      const reasonText = suspension_reason ? ` Reason: ${suspension_reason}` : "";
      return res.status(403).json({ success: false, message: `Your account has been suspended.${reasonText}` });
    }
    if (currentRole === "banned") {
      const reasonText = ban_reason ? ` Reason: ${ban_reason}` : "";
      return res.status(403).json({ success: false, message: `Your account has been banned.${reasonText}` });
    }

    req.user = { ...decoded, role: currentRole };
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

module.exports = {
  authenticate,
  authorize
};