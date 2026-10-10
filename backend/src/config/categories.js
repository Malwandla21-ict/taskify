/*
  Fixed category lists for every kind of listing (panel feedback,
  2026-10-04). Before this, "Category" was a free-text box, so the same
  thing ended up under several names ("Boots", "Safety Boots",
  "Uniform") and some made no sense at all.

  Each category belongs to ONE section — Academic or General — so the
  category decides the section and students no longer pick both.

  The same name is used on purpose wherever it applies to more than one
  listing type (e.g. "Calculators" for rentals AND sales), so the
  Academic / General pages can show one button per category.

  Keep in sync with TASKIFY_CATEGORIES in frontend/js/helpers.js.
*/

const CATEGORIES = {
  task: {
    Academic: ["Tutoring & Study Help", "Programming & Tech Help", "Printing & Typing", "Other academic"],
    General:  ["Errands & Deliveries", "Cleaning & Laundry", "Moving & Lifting", "Repairs & Fixes",
               "Hair & Beauty", "Photography & Design", "Other"]
  },
  equipment: {
    Academic: ["Equipment / Uniforms", "Calculators", "Laptops & Tablets", "Textbooks", "Other academic"],
    General:  ["Electronics & Gadgets", "Cameras & Audio", "Sports & Outdoor", "Kitchen & Appliances",
               "Party & Event Gear", "Other"]
  },
  sales: {
    Academic: ["Textbooks", "Equipment / Uniforms", "Calculators", "Laptops & Tablets", "Stationery", "Other academic"],
    General:  ["Electronics & Gadgets", "Clothing & Shoes", "Furniture & Room Items", "Kitchen & Appliances",
               "Sports & Outdoor", "Other"]
  },
  /* Campus Marketplace (stored in the events table — 2026-10-11). Only
     goods, services and exchanges happening on campus; not a general
     social calendar. The INSTITUTIONAL ones below need a "who authorised
     this" note and an admin check before they appear. */
  event: {
    Academic: ["Departmental opportunity"],
    General:  ["Campus market day", "Student stalls & pop-ups", "Swap & exchange",
               "University farm-produce sale", "Institutional surplus sale", "Lost-property sale or auction",
               "Other marketplace"]
  }
};

/* Campus Marketplace categories only an authorised publisher should use —
   held for an admin check, with the authority recorded. */
const INSTITUTIONAL_EVENT_CATEGORIES = [
  "University farm-produce sale", "Institutional surplus sale",
  "Lost-property sale or auction", "Departmental opportunity"
];

/* The old general-events categories. No longer offered for new posts, but
   existing events keep them (and can be edited without changing them)
   until they've run their course. */
const LEGACY_CATEGORIES = {
  event: {
    Academic: ["Workshop & Training", "Study Group / Revision", "Careers & Info Session",
               "Guest Lecture / Seminar", "Other academic"],
    General:  ["Sports & Fitness", "Society & Club Meeting", "Social & Entertainment", "Arts & Culture",
               "Community & Outreach", "Other"]
  }
};

function categoriesFor(type) {
  const groups = CATEGORIES[type];
  return groups ? [...groups.Academic, ...groups.General] : [];
}

function legacyCategoriesFor(type) {
  const groups = LEGACY_CATEGORIES[type];
  return groups ? [...groups.Academic, ...groups.General] : [];
}

/* "Academic" or "General" for a valid (current or legacy) category, otherwise null. */
function sectionFor(type, category) {
  for (const groups of [CATEGORIES[type], LEGACY_CATEGORIES[type]]) {
    if (!groups) continue;
    if (groups.Academic.includes(category)) return "Academic";
    if (groups.General.includes(category)) return "General";
  }
  return null;
}

/* Express middleware: put AFTER the validation rules. Overwrites
   req.body.section with the category's own section, so the two can
   never disagree whatever the browser sent. */
function applyCategorySection(type) {
  return (req, res, next) => {
    const section = sectionFor(type, req.body?.category);
    if (section) req.body.section = section;
    next();
  };
}

/* Used once by scripts/repair-listing-categories-schema.js to move old
   free-text categories onto the new list. First matching rule wins;
   anything unmatched becomes "Other academic" / "Other" depending on the
   section the listing was already in. The old category is tried first,
   then the title, so "Lab coat" typed under "misc" still lands in
   Equipment / Uniforms. */
const LEGACY_RULES = {
  task: [
    [/tutor|lesson|study|exam|revision|math|\bstat(s|istics)?\b|accounting|physics|chemistry|biology/i, "Tutoring & Study Help"],
    [/program|\bcod(e|ing)\b|java|python|website|\bweb\b|software|computer|\btech|database/i, "Programming & Tech Help"],
    [/print|typ(e|ing)|binding|scan|photocop/i, "Printing & Typing"],
    [/errand|deliver|pick ?up|shopping|grocer|queue/i, "Errands & Deliveries"],
    [/clean|laundry|wash|iron/i, "Cleaning & Laundry"],
    [/\bmov(e|ing|ers?)\b|\blift|carry|transport/i, "Moving & Lifting"],
    [/repair|fix|plumb|electric|mechanic/i, "Repairs & Fixes"],
    [/hair|braid|nail|make ?up|beauty|barber|lash/i, "Hair & Beauty"],
    [/photo|design|graphic|video|poster|logo|\bedit/i, "Photography & Design"]
  ],
  equipment: [
    [/uniform|boot|lab ?coat|overall|ppe|helmet|safety|goggle|toolkit|tool|drawing|drafting/i, "Equipment / Uniforms"],
    [/calculator/i, "Calculators"],
    [/laptop|tablet|ipad|chromebook/i, "Laptops & Tablets"],
    [/text ?book|\bbooks?\b|study guide/i, "Textbooks"],
    [/camera|speaker|audio|headphone|\bmic|tripod/i, "Cameras & Audio"],
    [/phone|electronic|gadget|charger|power ?bank|console|\btv\b|monitor|projector/i, "Electronics & Gadgets"],
    [/sport|\bball|bike|bicycle|\bgym|outdoor|\btent/i, "Sports & Outdoor"],
    [/kitchen|kettle|microwave|stove|fridge|appliance|\bpot|\biron\b|heater/i, "Kitchen & Appliances"],
    [/party|event|decor|sound system|chairs?|gazebo/i, "Party & Event Gear"]
  ],
  sales: [
    [/text ?book|\bbooks?\b|study guide|novel/i, "Textbooks"],
    [/uniform|boot|lab ?coat|overall|ppe|helmet|safety|goggle|toolkit|tool|drawing|drafting/i, "Equipment / Uniforms"],
    [/calculator/i, "Calculators"],
    [/laptop|tablet|ipad|chromebook/i, "Laptops & Tablets"],
    [/stationery|\bpens?\b|pencil|notebook|exercise book|\bfiles?\b|folder|ruler/i, "Stationery"],
    [/phone|electronic|gadget|charger|power ?bank|console|\btv\b|monitor|headphone|speaker|camera/i, "Electronics & Gadgets"],
    [/cloth|shoe|sneaker|dress|shirt|jacket|hoodie|fashion|\bjeans?\b/i, "Clothing & Shoes"],
    [/furniture|chair|desk|table|bed|mattress|shelf|rug|curtain|room/i, "Furniture & Room Items"],
    [/kitchen|kettle|microwave|stove|fridge|appliance|\bpot|\biron\b|heater/i, "Kitchen & Appliances"],
    [/sport|\bball|bike|bicycle|\bgym|outdoor|\btent/i, "Sports & Outdoor"]
  ],
  event: [
    [/workshop|training|bootcamp|hackathon|masterclass/i, "Workshop & Training"],
    [/study|revision|tutorial|exam prep/i, "Study Group / Revision"],
    [/career|info|expo|recruit|internship|graduate|job/i, "Careers & Info Session"],
    [/lecture|seminar|talk|symposium|conference|webinar/i, "Guest Lecture / Seminar"],
    [/sport|soccer|football|netball|rugby|fitness|gym|\brun|marathon|tournament/i, "Sports & Fitness"],
    [/society|club|meeting|\bsrc\b|association|chapter/i, "Society & Club Meeting"],
    [/\barts?\b|culture|dance|drama|poetry|heritage|exhibition|theatre/i, "Arts & Culture"],
    [/community|outreach|charity|volunteer|donation|clean ?up/i, "Community & Outreach"],
    [/party|social|music|concert|braai|entertain|movie|game|festival|gala/i, "Social & Entertainment"]
  ]
};

function mapLegacyCategory(type, { category, title, section }) {
  if (sectionFor(type, category)) return category; // already on the new list
  /* The owner's own category word first; only if that tells us nothing,
     look at the title. */
  for (const text of [category || "", title || ""]) {
    for (const [pattern, target] of LEGACY_RULES[type] || []) {
      if (pattern.test(text)) return target;
    }
  }
  return section === "Academic" ? "Other academic" : "Other";
}

module.exports = {
  CATEGORIES,
  LEGACY_CATEGORIES,
  INSTITUTIONAL_EVENT_CATEGORIES,
  legacyCategoriesFor,
  categoriesFor,
  sectionFor,
  applyCategorySection,
  mapLegacyCategory
};
