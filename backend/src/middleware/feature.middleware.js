const FEATURES = require("../config/features");

const FEATURE_OFF_MESSAGES = {
  endorsements: "Lecturer endorsements are switched off while the university's guidance on them is agreed.",
  feedback: "Feedback is switched off right now."
};

/* Refuses a request when its feature switch is off (config/features.js),
   so a hidden button can't be bypassed by calling the server directly. */
function requireFeature(name) {
  return (req, res, next) => {
    if (FEATURES[name]) return next();
    return res.status(403).json({ success: false, message: FEATURE_OFF_MESSAGES[name] || "This feature is switched off." });
  };
}

module.exports = { requireFeature };
