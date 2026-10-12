const { validationResult } = require("express-validator");
const { checkAcknowledgements } = require("../services/acknowledgement.service");

/*
  requireAcknowledgements(kindsFor) — put AFTER the validation rules (and
  after applyCategorySection, so req.body.section is settled). kindsFor is
  a list of kinds, or (req) => list, for rules that depend on the request
  (only academic tasks need the academic-honesty tick).

  Refuses with 400 unless req.body.acknowledgements = { kind: version }
  covers every kind at its current version, and leaves the list on
  req.acknowledgementKinds for the controller to record once the listing
  or booking is saved.
*/
function requireAcknowledgements(kindsFor) {
  return (req, res, next) => {
    /* Field errors (missing title, bad dates...) are reported first by
       the controller; the tick is only checked on an otherwise valid form. */
    if (!validationResult(req).isEmpty()) return next();
    const kinds = typeof kindsFor === "function" ? kindsFor(req) : kindsFor;
    const problem = checkAcknowledgements(req.body?.acknowledgements, kinds);
    if (problem) {
      return res.status(400).json({
        success: false,
        message: problem,
        errors: [{ path: "acknowledgements", msg: problem }]
      });
    }
    req.acknowledgementKinds = kinds;
    next();
  };
}

module.exports = { requireAcknowledgements };
