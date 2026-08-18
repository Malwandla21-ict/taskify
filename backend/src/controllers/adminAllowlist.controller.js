const adminAllowlistService = require("../services/adminAllowlist.service");

/*
  Read-only controller. There is intentionally no add/remove handler here —
  per panel feedback, admin status must never be grantable by another user
  through the interface. The allow-list can only be modified via the CLI
  script (backend/scripts/manage-admin-allowlist.js), run by whoever has
  direct server/database access. This keeps a single, auditable,
  out-of-band source of truth for admin eligibility.
*/
async function getAllowlist(req, res, next) {
  try {
    const list = await adminAllowlistService.getAllowlist();
    return res.status(200).json({
      success: true,
      message: "Admin allow-list fetched successfully.",
      data: list
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getAllowlist };