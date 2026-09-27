const contentModerationService = require("./contentModeration.service");
const notificationService = require("./notification.service");

/*
  Shared rules for editing a listing (task, sales item, equipment, event).

  An edit goes through the same content check as a new post — otherwise a
  harmless post could be edited into a harmful one after it was approved.
  On top of that:
    - a listing an admin removed can't be edited back into view;
    - a listing still waiting for review stays waiting (editing it doesn't
      skip the admin), and keeps its original flags for the admin to see;
    - a clean listing whose edit gets flagged goes back into review.
*/

const LABELS = {
  task:       { noun: "task",              heldTitle: "Task Held for Review" },
  sales_item: { noun: "sales listing",     heldTitle: "Listing Held for Review" },
  equipment:  { noun: "equipment listing", heldTitle: "Listing Held for Review" },
  event:      { noun: "event",             heldTitle: "Event Held for Review" }
};

/* `current` is the listing's row before the edit (needs moderation_status
   and moderation_flags). Returns the moderation values to save with it. */
async function moderateListingEdit({ contentType, userId, title, description, imageUrls = [], current }) {
  const { noun } = LABELS[contentType];

  if (current.moderation_status === "removed") {
    const error = new Error(`This ${noun} was removed by an admin and can't be edited.`);
    error.statusCode = 403;
    throw error;
  }

  const moderation = await contentModerationService.evaluateListingContent({ title, description, imageUrls });

  if (moderation.severe) {
    await contentModerationService.recordBlockedAttempt({
      contentType, userId, title, description,
      flaggedCategories: moderation.flaggedCategories
    });
    await notificationService.notifyAllAdmins({
      title: "Content Blocked",
      message: `An edit to the ${noun} "${(title || "").trim()}" was blocked for violating content policy (${moderation.flaggedCategories.join(", ")}).`,
      email: true
    });

    const error = new Error("This content violates our content policy and cannot be posted.");
    error.statusCode = 400;
    throw error;
  }

  const wasPending = current.moderation_status === "pending_review";
  return {
    moderationStatus: moderation.flagged || wasPending ? "pending_review" : "clean",
    moderationFlags: moderation.flagged
      ? JSON.stringify(moderation.flaggedCategories)
      : (wasPending ? current.moderation_flags ?? null : null),
    newlyFlagged: moderation.flagged && !wasPending,
    flaggedCategories: moderation.flaggedCategories
  };
}

/* Call after the edit is saved, when moderateListingEdit said newlyFlagged. */
async function notifyEditFlagged({ contentType, contextId, userId, title, flaggedCategories }) {
  const { noun, heldTitle } = LABELS[contentType];
  /* Notifications have no "equipment listing" context (only
     "equipment_booking"), so equipment ones are left untyped — same as
     createEquipment does. */
  const context = contentType === "equipment"
    ? { contextType: null, contextId: null }
    : { contextType: contentType, contextId };

  await notificationService.notifyAllAdmins({
    title: "Content Flagged for Review",
    message: `An edited ${noun}, "${title.trim()}", was flagged for review (${flaggedCategories.join(", ")}).`,
    ...context,
    email: true
  });
  await notificationService.createNotification({
    userId,
    title: heldTitle,
    message: `Your changes to "${title.trim()}" were flagged by our moderation system, so it's hidden from public view until an admin reviews it. We'll let you know as soon as it's approved.`,
    ...context,
    email: true
  });
}

module.exports = { moderateListingEdit, notifyEditFlagged };
