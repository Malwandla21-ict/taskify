/*
  Things people must read and tick before certain actions, so nobody can
  later say "I didn't know". The server refuses the action without the
  tick (middleware/acknowledgement.middleware.js) and records who ticked
  which version, when, and for which listing (user_acknowledgements).

  The browser shows exactly this text (GET /api/acknowledgements), so what
  was recorded is what was on screen. If you change the wording in a way
  that matters, bump `version`: anyone with the old version open is asked
  to read and tick again.

  Keep each point short and concrete — these are read on a phone, mid-task.
*/

const ACKNOWLEDGEMENTS = {
  academic_integrity: {
    version: "2026-10-12",
    title: "Academic honesty",
    when: "posting an academic task",
    points: [
      "This task is for help with learning: explaining, tutoring, checking work, or practice.",
      "It is not asking anyone to write or complete an assignment, test, exam, project or online quiz that will be marked — that is academic misconduct at UMP, for the person asking and the person helping.",
      "Taskify removes tasks like that and can suspend the accounts involved."
    ],
    agree: "I understand, and this task follows these rules."
  },

  selling_rules: {
    version: "2026-10-12",
    title: "Before you sell",
    when: "listing an item for sale",
    points: [
      "It's mine to sell — not borrowed, found, stolen, or university property.",
      "It's allowed on Taskify: no alcohol, drugs, medicine, weapons, fakes or copies, exam papers or answers, or anything else illegal.",
      "The description and photos are honest, including any faults. Buyers can report items that aren't as described.",
      "I'll hand it over in person, somewhere public on campus."
    ],
    agree: "I confirm all of the above for this item."
  },

  rental_owner: {
    version: "2026-10-12",
    title: "Before you rent this out",
    when: "listing equipment for rent",
    points: [
      "It's mine to lend — not university property or someone else's.",
      "It works and is safe to use, and I've described any faults.",
      "I'll check it with the renter at pickup and at return. The photos taken then are what protect me if it comes back damaged.",
      "Taskify doesn't insure items. If there's damage, an admin looks at the evidence and decides who was at fault; Taskify doesn't charge anyone."
    ],
    agree: "I understand and confirm the above."
  },

  rental_renter: {
    version: "2026-10-12",
    title: "Before you rent",
    when: "requesting a rental",
    points: [
      "From pickup until I return it, I'm responsible for the item, including loss or damage.",
      "I'll check it and take the pickup photos before I use it, and report a problem straight away instead of using it.",
      "I'll return it by the deadline. Late returns are recorded, and the next renter may be waiting for it.",
      "If damage is confirmed by an admin, it stays on my Taskify record."
    ],
    agree: "I understand my responsibilities as a renter."
  }
};

module.exports = { ACKNOWLEDGEMENTS };
