const jwt = require("jsonwebtoken");

/*
  All token issuing goes through here now (auth.service.js previously had
  its own duplicate generateToken — consolidated so there's exactly one
  place that decides claims/expiry).

  Two kinds of token:
  - Access token: normal "you are logged in" token. Carries a `tv`
    (token_version) claim that auth.middleware.js compares against the
    user's current token_version in the DB, so a password change,
    password reset, or 2FA disable can invalidate every outstanding
    token immediately just by bumping that column — no server-side
    session store needed.
  - Purpose token: short-lived, single-purpose token (pending 2FA login,
    email verification link, password reset link). Carries a `purpose`
    claim so one can never be replayed as another — a leaked
    "verify-email" token can't be used to skip a 2FA challenge, etc.
*/

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, tv: user.token_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

function signPurposeToken(purpose, payload, expiresIn) {
  return jwt.sign({ purpose, ...payload }, process.env.JWT_SECRET, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

/* Verifies a token AND checks it carries the expected purpose claim —
   use this for every purpose token instead of a bare verifyToken(). */
function verifyPurposeToken(token, expectedPurpose) {
  const decoded = verifyToken(token);
  if (decoded.purpose !== expectedPurpose) {
    const error = new Error("Invalid or expired token.");
    error.statusCode = 401;
    throw error;
  }
  return decoded;
}

module.exports = {
  signAccessToken,
  signPurposeToken,
  verifyToken,
  verifyPurposeToken
};
