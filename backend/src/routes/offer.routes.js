const express = require("express");
const { body, param, query } = require("express-validator");
const controller = require("../controllers/offer.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { NEGOTIATION } = require("../config/paymentSettings");

/* In-app offers on tasks and sales items (DEMO payments). Every route
   needs an account; who may see or do what is checked in offer.service. */
const router = express.Router();
router.use(authenticate);

const offerIdParam = param("id").isInt({ min: 1 }).withMessage("Offer ID must be a valid positive integer.");
const amountField = (name) => body(name)
  .notEmpty().withMessage("Enter an amount.")
  .isFloat({ gt: 0, max: 99999999 }).withMessage("Enter a valid amount.");
const messageField = body("message").optional({ values: "null" }).isString()
  .isLength({ max: NEGOTIATION.messageMaxLength })
  .withMessage(`Keep your note under ${NEGOTIATION.messageMaxLength} characters.`);

/* GET /api/offers?contextType=task|sales_item&contextId=12 */
router.get(
  "/",
  [
    query("contextType").isIn(["task", "sales_item"]).withMessage("contextType must be 'task' or 'sales_item'."),
    query("contextId").isInt({ min: 1 }).withMessage("contextId must be a valid positive integer.")
  ],
  controller.listOffers
);

router.post(
  "/",
  [
    body("contextType").isIn(["task", "sales_item"]).withMessage("contextType must be 'task' or 'sales_item'."),
    body("contextId").isInt({ min: 1 }).withMessage("contextId must be a valid positive integer."),
    amountField("amount"),
    messageField
  ],
  controller.createOffer
);

router.post("/:id/counter", [offerIdParam, amountField("amount"), messageField], controller.counterOffer);

/* expectedAmount = the amount shown on screen when Accept was pressed. */
router.patch("/:id/accept", [offerIdParam, amountField("expectedAmount")], controller.acceptOffer);
router.patch("/:id/decline", [offerIdParam], controller.declineOffer);
router.patch("/:id/withdraw", [offerIdParam], controller.withdrawOffer);

module.exports = router;
