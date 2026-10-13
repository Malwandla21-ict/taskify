/*
  Hand-written content for scripts/seed-demo-data.js — the temporary
  presentation data. Everything here is fictional. People are keyed by a
  short handle so listings can name their owner; anything without an
  owner is given one at random (seeded, so every run is the same).
*/

const AGRI = "Faculty of Agriculture and Natural Sciences";
const ECON = "Faculty of Economics, Development and Business Sciences";
const EDU = "Faculty of Education";

/* [handle, full name, faculty, year, bio, skills] — students */
const STUDENTS = [
  ["thandeka", "Thandeka Mokoena", AGRI, "3rd Year", "BSc Computer Science. I tutor first-years in Python and Maths, and I'm always around the library.", ["Python", "Java", "Tutoring", "Excel"]],
  ["sipho", "Sipho Nkosi", ECON, "2nd Year", "Development Studies. Part-time photographer — events, graduations, profile pics.", ["Photography", "Lightroom", "Canva"]],
  ["lindiwe", "Lindiwe Mahlangu", EDU, "4th Year", "Final-year Foundation Phase teacher. Happy to help with lesson plans and reading practice.", ["Lesson planning", "isiNdebele", "Reading support"]],
  ["kagiso", "Kagiso Molefe", AGRI, "2nd Year", "Agriculture student with a bakkie. Moving, collections and deliveries around Mbombela.", ["Driving (Code 08)", "Moving", "Deliveries"]],
  ["nomvula", "Nomvula Shabangu", ECON, "3rd Year", "Hospitality Management. I do braids, cornrows and wig installs from res.", ["Braids", "Wig installs", "Nails"]],
  ["themba", "Themba Mabuza", AGRI, "3rd Year", "IT student. I fix laptops and phones — screens, batteries, Windows reinstalls.", ["Laptop repair", "Windows", "Networking"]],
  ["ayanda", "Ayanda Dlamini", ECON, "1st Year", "First year in Economics. Looking for study partners for STA101.", ["Excel", "Typing"]],
  ["lerato", "Lerato Maseko", ECON, "2nd Year", "Tourism Management. I run errands and do grocery runs on weekends.", ["Errands", "Customer service"]],
  ["bongani", "Bongani Sibiya", AGRI, "4th Year", "Final-year Computer Science. Web development and database tutoring.", ["JavaScript", "SQL", "React", "Tutoring"]],
  ["zanele", "Zanele Nkambule", EDU, "2nd Year", "Education student, siSwati first language. I type and format assignments neatly.", ["Typing", "MS Word", "siSwati"]],
  ["tshepo", "Tshepo Mathebula", AGRI, "3rd Year", "Environmental Sciences. I sell second-hand textbooks every semester.", ["GIS", "Field work"]],
  ["precious", "Precious Ngobeni", ECON, "Honours", "Honours in Development Studies. Research and referencing help (APA/Harvard).", ["Referencing", "Research methods", "Xitsonga"]],
  ["mpho", "Mpho Malatji", AGRI, "1st Year", "First year Agriculture. New to Mbombela!", ["Gardening"]],
  ["karabo", "Karabo Masilela", ECON, "3rd Year", "Hospitality student and part-time chef. I cater small events.", ["Cooking", "Baking", "Event setup"]],
  ["nokuthula", "Nokuthula Khumalo", EDU, "3rd Year", "Future Maths teacher. Maths and Accounting tutoring for first years.", ["Mathematics", "Accounting", "Tutoring"]],
  ["siyabonga", "Siyabonga Zulu", AGRI, "2nd Year", "Computing student and gamer. I build and upgrade PCs.", ["PC building", "C++"]],
  ["refilwe", "Refilwe Mashego", ECON, "2nd Year", "Social Sciences. Cleaning and laundry service on weekends.", ["Cleaning", "Ironing"]],
  ["lwazi", "Lwazi Ndlovu", AGRI, "4th Year", "Biology final year. Lab practicals help and microscope tips.", ["Biology", "Lab techniques"]],
  ["busisiwe", "Busisiwe Mnisi", EDU, "1st Year", "Early Childhood Education, first year.", ["Childcare"]],
  ["kabelo", "Kabelo Moloto", ECON, "3rd Year", "Economics. Graphic design on the side — posters, logos, CVs.", ["Canva", "Illustrator", "CV design"]],
  ["naledi", "Naledi Sithole", AGRI, "2nd Year", "Computer Science. Love maths, hate early lectures.", ["Python", "Discrete maths"]],
  ["andile", "Andile Mkhabela", ECON, "Higher Certificate", "Higher Certificate in Event Management.", ["Event setup", "Sound"]],
  ["palesa", "Palesa Motaung", ECON, "3rd Year", "Tourism. I sell clothes and shoes I've outgrown.", ["Fashion"]],
  ["tiyani", "Tiyani Baloyi", AGRI, "3rd Year", "Agricultural Sciences. Plants, soil and a lot of patience.", ["Soil science", "Driving"]],
  ["hlulani", "Hlulani Chauke", EDU, "2nd Year", "Education. Xitsonga and English tutoring.", ["Xitsonga", "English", "Tutoring"]],
  ["mbali", "Mbali Gumede", ECON, "1st Year", "First year Hospitality.", ["Baking"]],
  ["sifiso", "Sifiso Magagula", AGRI, "Masters", "MSc Agriculture. I rent out field and lab gear I'm not using.", ["Research", "Statistics", "R"]],
  ["ntombi", "Ntombi Simelane", EDU, "3rd Year", "Education. I do hair and make-up for functions.", ["Make-up", "Hair"]],
  ["katlego", "Katlego Phiri", AGRI, "2nd Year", "Computing. Phone repairs and screen protectors.", ["Phone repair"]],
  ["rethabile", "Rethabile Mokwena", ECON, "4th Year", "Final year Development Studies. Selling everything before I graduate!", ["Project management"]],
  ["jabulani", "Jabulani Mthethwa", AGRI, "3rd Year", "Environmental Sciences. Hiking, camping, outdoor gear.", ["Hiking", "First aid"]],
  ["nandi", "Nandi Msibi", ECON, "2nd Year", "Social Sciences. Errands, queues and printing runs.", ["Errands"]],
  ["johan", "Johan van der Merwe", AGRI, "3rd Year", "Agricultural Sciences. Afrikaans tutoring and farm work.", ["Afrikaans", "Tractor driving"]],
  ["chloe", "Chloé Pretorius", ECON, "2nd Year", "Hospitality. Barista on weekends.", ["Coffee", "Customer service"]],
  ["priya", "Priya Naidoo", AGRI, "4th Year", "Computer Science. Data science and statistics tutoring.", ["Statistics", "Python", "Tutoring"]],
  ["ruan", "Ruan Botha", ECON, "1st Year", "First year Economics. Rugby and accounting.", ["Accounting"]],
  ["keamogetswe", "Keamogetswe Sebola", EDU, "3rd Year", "Education. Sepedi tutoring and reading groups.", ["Sepedi", "Tutoring"]],
  ["tumelo", "Tumelo Ramokgopa", AGRI, "2nd Year", "IT. Networking and printer fixes.", ["Networking", "Printers"]],
  ["vusi", "Vusi Lubisi", ECON, "3rd Year", "Development Studies. DJ for res parties.", ["DJ", "Sound"]],
  ["gugu", "Gugu Thwala", EDU, "2nd Year", "Education. Sewing and alterations.", ["Sewing", "Alterations"]]
];

/* Lecturers (verified) and one staff member. */
const LECTURERS = [
  { handle: "mavuso", name: "Nonhlanhla Mavuso", title: "Dr.", faculty: AGRI, years: 9,
    office: "Mbombela Campus, Building 5, Office 2.14", mode: "In person or on Teams",
    availability: "Consultations Tuesdays and Thursdays, 10:00–12:00.",
    bio: "Lecturer in Computer Science (programming and databases). I endorse students who tutor well and help others honestly." },
  { handle: "steyn", name: "Pieter Steyn", title: "Prof.", faculty: AGRI, years: 22,
    office: "Mbombela Campus, Agriculture building, Office 1.03", mode: "In person",
    availability: "Wednesdays 14:00–16:00, or email to book.",
    bio: "Professor of Agricultural Sciences. Soil fertility and crop production." },
  { handle: "shongwe", name: "Mandla Shongwe", title: "Dr.", faculty: ECON, years: 7,
    office: "Mbombela Campus, Building 7, Office 3.22", mode: "In person or on Teams",
    availability: "Mondays 09:00–11:00.",
    bio: "Senior Lecturer in Development Studies. Research methods and community development." }
];
const STAFF = [
  { handle: "mkhonto", name: "Sizwe Mkhonto", faculty: "Student Affairs",
    bio: "Student Affairs — residence life and student markets." }
];

/* Places tasks, items and meetups happen. */
const PLACES = {
  library: "Mbombela Campus, Library",
  centre: "Mbombela Campus, Student Centre",
  cafeteria: "Mbombela Campus, cafeteria",
  gate: "Mbombela Campus, Main Gate",
  lab: "Mbombela Campus, computer lab",
  res: "Mbombela Campus, residence",
  siyaLib: "Siyabuswa Campus, Library",
  siyaCentre: "Siyabuswa Campus, Student Centre",
  riverside: "Riverside, Mbombela",
  westAcres: "West Acres, Mbombela",
  sonheuwel: "Sonheuwel, Mbombela",
  cbd: "Mbombela CBD",
  kanyamazane: "KaNyamazane",
  whiteRiver: "White River"
};

/* Tasks: [poster or null, title, description, category, section, price, place, urgent] */
const TASKS = [
  ["ayanda", "Help me understand hypothesis testing (STA101)", "I keep mixing up one- and two-tailed tests and p-values. Looking for 2 sessions of an hour each to go through the tutorial questions with me before the semester test. I'll bring my notes.", "Tutoring & Study Help", "Academic", 200, "library", false],
  ["mpho", "Python tutoring — loops and functions", "First-year programming. I understand the lectures but freeze when I have to write code myself. Want someone patient to do practice problems with me twice a week.", "Tutoring & Study Help", "Academic", 250, "lab", false],
  ["ruan", "Accounting 1 — explain journals and ledgers", "Need someone to explain double entry properly with examples. One long session on Saturday morning.", "Tutoring & Study Help", "Academic", 180, "library", false],
  ["busisiwe", "Reading group for isiNdebele literature", "Looking for someone fluent to lead a small reading group (3 of us) through the set novel, one chapter a week.", "Tutoring & Study Help", "Academic", 150, "centre", false],
  ["mbali", "Explain SQL joins before my practical", "Practical is on Thursday. I need someone to sit with me for an hour and go through INNER/LEFT joins with the sample database.", "Programming & Tech Help", "Academic", 150, "lab", true],
  ["thandeka", "Print and bind 3 copies of my research poster", "A1 poster, colour, plus spiral-bind 3 copies of a 40-page report. I'll send the PDFs. Need them by Friday.", "Printing & Typing", "Academic", 320, "cbd", true],
  ["precious", "Type up handwritten interview transcripts", "About 12 pages of handwritten notes from field interviews (English). Needs to be typed accurately into Word. I'll supply the formatting template.", "Printing & Typing", "Academic", 280, "library", false],
  ["ayanda", "Set up Excel for my budget practical", "Want someone to show me how to use SUMIF, VLOOKUP and pivot tables on my own data. Not doing the practical for me — just teaching.", "Programming & Tech Help", "Academic", 160, "lab", false],
  ["naledi", "Discrete maths practice partner", "Looking for a 3rd/4th year to go over proofs by induction and set theory exercises. Two sessions.", "Tutoring & Study Help", "Academic", 220, "library", false],
  ["katlego", "Help configuring Git and GitHub", "Can't get SSH keys working on my laptop for the group project. 30 minutes of help should do it.", "Programming & Tech Help", "Academic", 100, "lab", false],
  ["hlulani", "Proofread my teaching-practice portfolio", "Check spelling, grammar and referencing in a 25-page portfolio. Comments only — I'll make the changes myself.", "Other academic", "Academic", 200, "siyaLib", false],
  ["mpho", "Explain soil pH lab report format", "What goes in the discussion vs the results? Want someone who's done AGR102 to look at my structure and explain.", "Other academic", "Academic", 120, "library", false],
  ["lerato", "Collect a parcel from PostNet in Riverside", "Parcel is ready for collection (I'll send the slip and ID copy). Drop it at res before 6pm.", "Errands & Deliveries", "General", 80, "riverside", true],
  ["chloe", "Grocery run to Checkers West Acres", "List of about 15 items, I'll pay for groceries upfront via the app. Need it Saturday morning.", "Errands & Deliveries", "General", 100, "westAcres", false],
  ["thandeka", "Pick up my laptop from the repair shop in town", "Laptop is fixed and paid for at a shop in the CBD. Just need it collected and brought to campus. I'll give you the reference number.", "Errands & Deliveries", "General", 90, "cbd", false],
  ["johan", "Stand in the bank queue for me", "Need to be at a meeting during the bank's opening hours. Hold my place in the queue at Riverside Mall until I arrive (about an hour).", "Errands & Deliveries", "General", 70, "riverside", false],
  ["mbali", "Deliver a cake to KaNyamazane", "Birthday cake for my sister, needs careful transport. Pick up at res at 2pm, deliver by 3pm.", "Errands & Deliveries", "General", 150, "kanyamazane", true],
  ["priya", "Deep clean of a res room before move-out", "Two-sharing room. Floors, windows, bathroom, fridge. I supply cleaning products.", "Cleaning & Laundry", "General", 250, "res", false],
  ["ruan", "Wash and iron a week's laundry", "One full bag. Collect Monday, return Wednesday. Ironing shirts is the main thing.", "Cleaning & Laundry", "General", 120, "res", false],
  ["rethabile", "Help me move out of my flat in Sonheuwel", "Moving to a new place in West Acres. Bed, desk, fridge and about 10 boxes. Need someone with a bakkie plus one more pair of hands.", "Moving & Lifting", "General", 650, "sonheuwel", false],
  ["lindiwe", "Carry boxes from res to the storage room", "End of year storage. About 8 boxes and a mini fridge, down two flights of stairs.", "Moving & Lifting", "General", 150, "res", false],
  ["ayanda", "Replace my cracked phone screen", "Samsung A14, screen cracked but touch still works. You source the part or I can buy it — let me know the price.", "Repairs & Fixes", "General", 450, "centre", false],
  ["busisiwe", "Fix laptop that won't charge", "HP 250 G8. Charger light comes on but the battery stays at 0%. Need a diagnosis first.", "Repairs & Fixes", "General", 200, "lab", true],
  ["naledi", "Knotless braids — medium, mid-back", "Need knotless braids for graduation week. I'll buy the hair. Saturday from 8am.", "Hair & Beauty", "General", 450, "res", false],
  ["palesa", "Make-up for a formal dinner", "Soft glam for the faculty dinner on Friday at 5pm. I have my own foundation.", "Hair & Beauty", "General", 250, "res", false],
  ["kabelo", "Photographer for our society launch", "Two hours on a weekday evening at the Student Centre. Need about 40 edited photos within a week.", "Photography & Design", "General", 600, "centre", false],
  ["andile", "Design a poster for a res braai", "A4 poster and an Instagram square. I'll give you the details and our logo.", "Photography & Design", "General", 180, "centre", false],
  ["precious", "Professional headshots for LinkedIn", "Need 3–4 good headshots on campus for my LinkedIn and CV. 30-minute shoot.", "Photography & Design", "General", 300, "gate", false],
  ["tiyani", "Help planting a veggie garden at home", "Turning a small backyard patch into a veggie garden in White River. Digging, compost and planting seedlings. Saturday morning.", "Other", "General", 300, "whiteRiver", false],
  ["vusi", "Help set up sound for a res event", "Need an extra pair of hands to set up and pack away speakers and lights. Friday 5pm–7pm and 11pm–midnight.", "Other", "General", 200, "res", false],
  ["gugu", "Assemble a flat-pack wardrobe", "Two-door wardrobe from a furniture store, all parts and tools here. Should take about 2 hours.", "Other", "General", 200, "sonheuwel", false],
  ["keamogetswe", "Tutor Sepedi grammar for a friend", "My roommate needs help with Sepedi grammar for an elective. 4 sessions over two weeks.", "Tutoring & Study Help", "Academic", 300, "siyaCentre", false],
  ["sipho", "Edit a 3-minute event highlight video", "Raw footage is ready (about 20 clips). Need a simple cut with music and titles in CapCut or Premiere.", "Photography & Design", "General", 350, "centre", false],
  ["nandi", "Explain microeconomics graphs (ECO102)", "Supply and demand shifts and elasticity graphs. One session before the test next week.", "Tutoring & Study Help", "Academic", 150, "library", false],
  ["themba", "Fetch a printer from a seller in town", "I bought a second-hand printer, it needs collecting from the CBD and dropping at my place in Riverside.", "Errands & Deliveries", "General", 120, "cbd", false],
  ["siyabonga", "Second pair of hands moving a PC desk", "Heavy L-shaped desk from the 2nd floor to the ground floor. 20 minutes.", "Moving & Lifting", "General", 80, "res", false],
  ["lwazi", "Help organising specimens for a lab practical", "Sort and label about 60 plant specimens before Monday's practical. Careful work, no experience needed.", "Other academic", "Academic", 200, "library", false],
  ["karabo", "Kitchen help for a 30-person function", "Prep and serving for a small birthday function in Riverside. Saturday 12:00–18:00, meal included.", "Other", "General", 400, "riverside", false],
  ["zanele", "Iron and fold graduation outfits", "Three outfits for my family for graduation. Need them pressed properly the day before.", "Cleaning & Laundry", "General", 100, "res", false],
  ["tshepo", "Go through my GIS map layout with me", "Want feedback on how to lay out a QGIS map properly (legend, scale bar, projection). Teaching, not doing it.", "Programming & Tech Help", "Academic", 180, "lab", false],
  ["jabulani", "Lift to the start of a hiking trail", "Drop-off near Kaapsche Hoop at 6am on Saturday, pick-up at 3pm. Fuel paid separately.", "Errands & Deliveries", "General", 350, "whiteRiver", false],
  ["nokuthula", "Someone to quiz me on teaching methods theory", "Exam prep — just ask me questions from my summary notes for an hour or two.", "Tutoring & Study Help", "Academic", 120, "library", false],
  ["chloe", "Fix a wobbly bed frame", "Bed frame squeaks and wobbles — probably needs new bolts. Bring a screwdriver set.", "Repairs & Fixes", "General", 100, "res", false],
  ["mpho", "Set up my new laptop", "New Lenovo laptop: Windows updates, Office with my student account, antivirus and backing up from my old one.", "Programming & Tech Help", "Academic", 150, "lab", false],
  ["ntombi", "Cornrows for a 6-year-old", "Simple straight-back cornrows for my niece. Sunday afternoon.", "Hair & Beauty", "General", 120, "kanyamazane", false],
  ["rethabile", "Sell my furniture online for me", "Take photos and list about 8 furniture items for sale, and reply to buyers. Commission on top of the fee.", "Other", "General", 250, "sonheuwel", false],
  ["johan", "Afrikaans conversation practice partner", "I'm the tutor usually, but I need English presentation practice in return. Swap? Price is for one hour a week for a month.", "Tutoring & Study Help", "Academic", 200, "cafeteria", false],
  ["lerato", "Help with CV and cover letter layout", "I have the content, need help making it look professional in Word or Canva.", "Photography & Design", "General", 150, "library", false],
  ["ayanda", "Queue at the financial aid office for me", "The queue starts early. Hold my place from 7am until I arrive at 8:30.", "Errands & Deliveries", "General", 60, "centre", false],
  ["palesa", "Alter two dresses", "Take in at the waist and shorten. I'll bring them to you.", "Other", "General", 160, "res", false]
];

/* Sales: [seller or null, title, description, category, section, price, condition, place, quantity] */
const SALES = [
  ["tshepo", "Campbell Biology (12th edition)", "Used for BIO101 and BIO102. Some highlighting in the first 5 chapters, otherwise clean. No missing pages.", "Textbooks", "Academic", 450, "Good", "library", 1],
  ["thandeka", "Introduction to Algorithms (CLRS, 3rd ed.)", "The classic algorithms textbook. Hardcover, a few pencil notes. Great for 2nd and 3rd year CS.", "Textbooks", "Academic", 600, "Good", "lab", 1],
  ["rethabile", "Development Studies readers bundle (3 books)", "Three readers from DEV modules (1st–3rd year). Selling as a bundle.", "Textbooks", "Academic", 350, "Fair", "library", 1],
  ["nokuthula", "Casio fx-991ZA PLUS calculator", "Works perfectly, the approved exam calculator. Comes with the cover.", "Calculators", "Academic", 280, "Excellent", "library", 1],
  ["bongani", "Casio fx-82ZA PLUS II calculators", "Bought a few for a tutoring group, these are left over. Brand new in packaging.", "Calculators", "Academic", 220, "New", "centre", 4],
  ["lwazi", "White lab coat, size M", "Worn for two years of practicals. Washed and ironed, no stains.", "Equipment / Uniforms", "Academic", 150, "Good", "library", 1],
  ["sifiso", "Lab coats (S, M, L) — new", "Ordered too many for our research group. New, still in plastic. R180 each.", "Equipment / Uniforms", "Academic", 180, "New", "library", 6],
  ["tiyani", "Safety boots, size 8", "Required for farm practicals. Worn about 10 times.", "Equipment / Uniforms", "Academic", 320, "Good", "gate", 1],
  ["johan", "Overalls, navy, size 34", "Two pairs of farm overalls, washed. Selling separately.", "Equipment / Uniforms", "Academic", 140, "Used", "gate", 2],
  ["themba", "HP 250 G8 laptop (i5, 8GB, 256GB SSD)", "Battery holds about 3 hours. New SSD installed, fresh Windows 11. Charger included.", "Laptops & Tablets", "Academic", 4500, "Good", "lab", 1],
  ["rethabile", "Samsung Galaxy Tab A8 with keyboard case", "Great for notes and readings. Small scratch on the back. Keyboard case and charger included.", "Laptops & Tablets", "Academic", 2800, "Excellent", "centre", 1],
  ["siyabonga", "Lenovo IdeaPad 3 (Ryzen 5, 16GB)", "Upgraded the RAM to 16GB. Runs Android Studio fine. Selling because I built a desktop.", "Laptops & Tablets", "Academic", 6200, "Excellent", "lab", 1],
  ["precious", "A4 hard-cover notebooks (pack of 5)", "Unused, bought too many. 192 pages each.", "Stationery", "Academic", 120, "New", "library", 3],
  ["zanele", "Highlighters, pens and sticky notes bundle", "Stabilo highlighters (6), 10 pens, 4 sticky note pads. Moving out.", "Stationery", "Academic", 90, "Excellent", "res", 1],
  ["lindiwe", "Foundation Phase teaching resources", "Laminated flashcards, phonics charts and a box of counters. Perfect for teaching practice.", "Other academic", "Academic", 250, "Good", "siyaLib", 1],
  ["priya", "Statistics for Business and Economics", "Used for STA modules. Clean copy, no writing.", "Textbooks", "Academic", 380, "Excellent", "library", 1],
  ["ruan", "Financial Accounting textbook (Juta)", "First-year accounting textbook. Current edition.", "Textbooks", "Academic", 420, "Good", "library", 1],
  ["keamogetswe", "Sepedi dictionary and grammar book", "Both in good condition, useful for language electives.", "Textbooks", "Academic", 200, "Good", "siyaCentre", 1],
  ["rethabile", "Mini fridge (Defy, 90 litres)", "Perfect for res. Cools well, very quiet. Moving out at the end of the year.", "Kitchen & Appliances", "General", 1200, "Good", "res", 1],
  ["karabo", "Two-plate stove", "Works well, cleaned. Great for a flat.", "Kitchen & Appliances", "General", 450, "Good", "riverside", 1],
  ["chloe", "Microwave (20L, Russell Hobbs)", "Bought last year, works perfectly.", "Kitchen & Appliances", "General", 650, "Excellent", "westAcres", 1],
  ["mbali", "Kettle and toaster set", "Matching set, both working. Selling as I'm moving home.", "Kitchen & Appliances", "General", 280, "Good", "res", 1],
  ["rethabile", "Study desk with drawers", "Solid wood-look desk, 120cm wide. You collect from Sonheuwel.", "Furniture & Room Items", "General", 900, "Good", "sonheuwel", 1],
  ["gugu", "Office chair, adjustable", "Comfortable, height adjustment works. Small tear on the armrest.", "Furniture & Room Items", "General", 550, "Fair", "sonheuwel", 1],
  ["lindiwe", "Bedside lamp and desk lamp", "Two lamps, both LED. Selling together.", "Furniture & Room Items", "General", 180, "Good", "res", 1],
  ["palesa", "Single bed mattress", "Two years old, always used with a protector. Collect from res.", "Furniture & Room Items", "General", 700, "Good", "res", 1],
  ["palesa", "Ladies sneakers, size 5", "Nike Air Max, worn a few times. Original box.", "Clothing & Shoes", "General", 650, "Excellent", "res", 1],
  ["ntombi", "Formal dresses (size 32/34)", "Worn once each for functions. Three colours available.", "Clothing & Shoes", "General", 350, "Excellent", "res", 3],
  ["vusi", "Men's formal shoes, size 9", "Black leather, worn to two graduation ceremonies.", "Clothing & Shoes", "General", 400, "Good", "centre", 1],
  ["nomvula", "Braiding hair packs (Darling)", "Leftover packs, unopened. Colour 1B.", "Clothing & Shoes", "General", 45, "New", "res", 12],
  ["themba", "Wireless mouse and keyboard combo", "Logitech, USB receiver included.", "Electronics & Gadgets", "General", 250, "Excellent", "lab", 1],
  ["katlego", "Tempered glass screen protectors", "For Samsung A-series and iPhones. I can fit it for you at no extra cost.", "Electronics & Gadgets", "General", 60, "New", "centre", 20],
  ["siyabonga", "24\" Samsung monitor", "1080p, HDMI cable included. No dead pixels.", "Electronics & Gadgets", "General", 1400, "Excellent", "lab", 1],
  ["vusi", "JBL Flip 5 Bluetooth speaker", "Loud and clear, battery still good. Charging cable included.", "Electronics & Gadgets", "General", 1100, "Good", "res", 1],
  ["kabelo", "Power bank 20 000mAh", "Fast charging, used for a few months.", "Electronics & Gadgets", "General", 300, "Good", "centre", 1],
  ["sipho", "Extension cord with surge protection", "4-way multiplug with surge protection. Essential for load-shedding.", "Electronics & Gadgets", "General", 150, "Good", "res", 2],
  ["jabulani", "Hiking backpack (45L)", "Hydration sleeve, rain cover included. Done about 10 hikes.", "Sports & Outdoor", "General", 750, "Good", "gate", 1],
  ["ruan", "Rugby boots, size 10", "Used for one season.", "Sports & Outdoor", "General", 380, "Good", "gate", 1],
  ["andile", "Yoga mat and resistance bands", "Mat plus a set of 5 bands.", "Sports & Outdoor", "General", 200, "Excellent", "res", 1],
  ["johan", "Mountain bike (26\")", "Recently serviced, new tyres. Helmet included.", "Sports & Outdoor", "General", 2500, "Good", "whiteRiver", 1],
  ["mpho", "Clothes rail and hangers", "Free-standing rail with 30 hangers.", "Other", "General", 220, "Good", "res", 1],
  ["karabo", "Homemade rusks (1kg packs)", "Buttermilk and muesli rusks, baked fresh every week. Order by Wednesday for Friday.", "Other", "General", 95, "New", "centre", 15],
  ["tshepo", "Environmental Science textbook bundle", "Two textbooks for 1st and 2nd year ENV modules.", "Textbooks", "Academic", 500, "Fair", "library", 1],
  ["naledi", "Graph paper and maths sets", "Five maths sets and two pads of graph paper.", "Stationery", "Academic", 80, "New", "library", 5],
  ["hlulani", "Xitsonga novels for set works", "The prescribed novels for 2nd year, no notes inside.", "Textbooks", "Academic", 160, "Good", "siyaLib", 1],
  ["thandeka", "Raspberry Pi 4 (4GB) starter kit", "Case, power supply and 32GB SD card. Used for one project.", "Electronics & Gadgets", "General", 1300, "Excellent", "lab", 1],
  ["lerato", "Kettle (1.7L)", "Works well, descaled.", "Kitchen & Appliances", "General", 120, "Good", "res", 1],
  ["refilwe", "Ironing board and steam iron", "Both work well. Selling together.", "Kitchen & Appliances", "General", 260, "Good", "res", 1]
];

/* Rentals: [owner or null, name, description, category, section, daily price, item value, condition] */
const EQUIPMENT = [
  ["nokuthula", "Casio fx-991ZA PLUS (exam approved)", "For tests and exams. Pick up the day before, return the day after.", "Calculators", "Academic", 25, 350, "Excellent"],
  ["bongani", "Casio fx-82ZA PLUS II", "Basic scientific calculator, good for first-year tests.", "Calculators", "Academic", 15, 220, "Functional"],
  ["thandeka", "Graphing calculator (Casio fx-CG50)", "Colour graphing calculator for maths and stats modules.", "Calculators", "Academic", 40, 1800, "Excellent"],
  ["lwazi", "Lab coat and safety goggles set", "Size L coat plus goggles. Washed after every rental.", "Equipment / Uniforms", "Academic", 20, 250, "Functional"],
  ["sifiso", "Soil testing kit", "pH, N, P and K test kit with enough reagents for about 20 tests.", "Equipment / Uniforms", "Academic", 45, 900, "Excellent"],
  ["tiyani", "Gumboots, size 7 and 9", "Two pairs for farm and field practicals.", "Equipment / Uniforms", "Academic", 15, 300, "Functional"],
  ["themba", "Dell Latitude laptop (i5, 8GB)", "For students whose laptop is in for repair. Office installed. Charger included.", "Laptops & Tablets", "Academic", 80, 5000, "Functional"],
  ["rethabile", "iPad (9th gen) with Apple Pencil", "Great for annotating readings. Comes with a case.", "Laptops & Tablets", "Academic", 70, 6500, "Excellent"],
  ["priya", "Statistics textbook (Keller)", "Rent for the semester instead of buying.", "Textbooks", "Academic", 10, 600, "Functional"],
  ["tshepo", "GIS and Remote Sensing textbook", "For the 3rd-year GIS module.", "Textbooks", "Academic", 10, 700, "Functional"],
  ["sipho", "Canon EOS 2000D camera with 18–55mm lens", "Two batteries, 64GB card and bag. Great for events and projects.", "Cameras & Audio", "General", 150, 7500, "Excellent"],
  ["sipho", "Tripod (160cm)", "Aluminium tripod with phone mount.", "Cameras & Audio", "General", 30, 600, "Excellent"],
  ["vusi", "Bluetooth PA speaker with 2 mics", "Party speaker with wireless mics. Great for res events and society meetings.", "Party & Event Gear", "General", 200, 4500, "Excellent"],
  ["vusi", "LED party lights set", "Four LED par lights with stands and remote.", "Party & Event Gear", "General", 120, 2200, "Functional"],
  ["andile", "Folding tables (set of 2)", "1.8m trestle tables for stalls and events.", "Party & Event Gear", "General", 60, 1400, "Functional"],
  ["andile", "Gazebo 3m × 3m", "Pop-up gazebo for market days. Takes two people to set up.", "Party & Event Gear", "General", 100, 1800, "Functional"],
  ["karabo", "Chafing dishes (set of 4)", "Keep food warm at functions. Fuel not included.", "Kitchen & Appliances", "General", 80, 1600, "Excellent"],
  ["chloe", "Coffee machine (pod)", "Nespresso-style pod machine for events or exam season.", "Kitchen & Appliances", "General", 50, 1500, "Excellent"],
  ["jabulani", "2-person tent", "Light hiking tent, easy to pitch. Footprint included.", "Sports & Outdoor", "General", 60, 1800, "Excellent"],
  ["jabulani", "Sleeping bag (0°C)", "Washed after every rental.", "Sports & Outdoor", "General", 35, 900, "Functional"],
  ["ruan", "Rugby ball and cones set", "For practice sessions.", "Sports & Outdoor", "General", 15, 450, "Functional"],
  ["siyabonga", "PlayStation 4 with 2 controllers", "For weekend gaming nights. FIFA and Tekken included.", "Electronics & Gadgets", "General", 120, 4000, "Functional"],
  ["siyabonga", "Projector (1080p)", "HDMI projector for movie nights or presentations. Screen not included.", "Electronics & Gadgets", "General", 150, 3500, "Excellent"],
  ["katlego", "Portable Wi-Fi router", "Insert your own SIM. Handy during outages.", "Electronics & Gadgets", "General", 25, 800, "Functional"],
  ["gugu", "Sewing machine (Singer)", "Basic sewing machine, great for alterations.", "Other", "General", 60, 2500, "Excellent"],
  ["kagiso", "Hand trolley", "Folding hand trolley for moving boxes.", "Other", "General", 30, 700, "Functional"],
  ["themba", "Laptop charger (universal, 90W)", "Comes with 8 tips. Check your laptop model with me first.", "Electronics & Gadgets", "General", 20, 450, "Functional"],
  ["kabelo", "Ring light with phone holder", "18-inch ring light for content creation and online interviews.", "Cameras & Audio", "General", 40, 900, "Excellent"]
];

/* Campus Marketplace (events table). [organizer, title, description, category, section, place, days from now, hour, capacity, has_food, has_refreshments, authority] */
const EVENTS = [
  ["mkhonto", "Spring Market Day", "Student stalls, food, second-hand books and clothes on the lawn outside the Student Centre. Book a stall through Student Affairs.", "Campus market day", "General", "centre", 9, 10, null, 1, 1, null],
  ["mkhonto", "Res Swap Shop: clothes and books", "Bring clothes, shoes and books you don't need and swap them for something you do. Leftovers are donated.", "Swap & exchange", "General", "res", 4, 14, 80, 0, 1, null],
  ["steyn", "Farm produce sale: vegetables and eggs", "Fresh vegetables and eggs from the university's teaching farm, sold by Agriculture students. Bring your own bags.", "University farm-produce sale", "General", "gate", 6, 8, null, 1, 0, "Authorised by the School of Agricultural Sciences farm office"],
  ["mkhonto", "Lost-property sale", "Unclaimed items from this year's lost property: umbrellas, bottles, jackets and calculators. Proceeds go to the student hardship fund.", "Lost-property sale or auction", "General", "centre", 13, 11, null, 0, 0, "Authorised by Student Affairs and Campus Protection Services"],
  ["mavuso", "Paid tutor posts: Computing first-year modules", "The School is recruiting paid student tutors for first-year programming modules next semester. Info session and sign-up.", "Departmental opportunity", "Academic", "lab", 7, 13, 40, 0, 1, "Authorised by the Head of School, Computing and Mathematical Sciences"],
  ["mkhonto", "Student pop-up stalls: Heritage Month", "Traditional food, beadwork and crafts by students. Stall bookings are closed.", "Student stalls & pop-ups", "General", "centre", -18, 10, null, 1, 1, null]
];

/* Words for the extras the seed script stitches together. */
const APPLICATION_NOTES = [
  "Hi! I've done this before and can start tomorrow afternoon.",
  "I'm free this weekend. I got a distinction in this module last year.",
  "Can do it today after 3pm if that works for you.",
  "I live close by, so I can get it done quickly.",
  "Happy to help. I've got good reviews for similar tasks.",
  "I'm available Saturday morning. Let me know!",
  "I tutor this every semester — happy to share my practice questions too.",
  "I can do this. I have my own transport."
];

const TASK_REVIEWS_FOR_WORKER = [
  [5, "Explained everything so clearly. I finally understand it. Highly recommend!"],
  [5, "Quick, friendly and did exactly what I asked. Will book again."],
  [5, "Very patient and on time. Thank you!"],
  [4, "Good work, just arrived a bit later than we agreed."],
  [5, "Went above and beyond. Brought extra practice questions."],
  [4, "Did a solid job. Communication could have been quicker."],
  [5, "Super reliable. Everything was delivered in perfect condition."],
  [5, "Honest and careful — felt safe leaving my things with them."],
  [3, "Got it done, but it took longer than expected."]
];
const TASK_REVIEWS_FOR_POSTER = [
  [5, "Clear instructions and paid straight away through Taskify."],
  [5, "Lovely to work with. Was ready on time."],
  [4, "Good communication, easy task."],
  [5, "Very organised and friendly."]
];
const RENTAL_REVIEWS_FOR_OWNER = [
  [5, "Item was exactly as described and spotless. Easy pickup."],
  [5, "Great owner, very flexible with pickup times."],
  [4, "Worked well. Pickup was a little late but no problem."],
  [5, "Saved me from buying one for a single test. Thanks!"]
];
const RENTAL_REVIEWS_FOR_RENTER = [
  [5, "Returned on time and in perfect condition."],
  [5, "Careful renter, would rent to them again."],
  [4, "All good, returned a few minutes late."]
];

/* Short chats: lines alternate, starting with the person who opened the chat. */
const TASK_CHATS = [
  ["Hi! I saw you accepted my task. When are you free?", "Hi, I can do tomorrow at 2pm. Is that okay?", "Perfect, see you then.", "Great, I'll message you when I'm on my way."],
  ["Hello, thanks for picking me. Where exactly should we meet?", "At the library entrance, ground floor.", "Cool, I'll be wearing a green jacket.", "👍"],
  ["Just checking — do I need to bring anything?", "Just your notes and the tutorial questions.", "Okay, will do. Thanks!"]
];
const SALE_CHATS = [
  ["Hi, is this still available?", "Yes it is!", "Can I see it tomorrow at the library?", "Sure, 12:00 works for me.", "Great, I'll buy it through Taskify so it's protected."],
  ["Hello, would you take a bit less?", "You can send me an offer on Taskify and I'll have a look.", "Okay, sending one now."],
  ["Hi! Does it come with the charger?", "Yes, charger and the box.", "Awesome, I'll take it."]
];
const RENTAL_CHATS = [
  ["Hi, I've just paid for the booking. When can I collect?", "Thanks! Anytime after 10am at the Student Centre.", "See you at 11 then.", "Remember to take the pickup photos in the app 🙂"],
  ["Hello, is it okay if I return it at 5pm instead of 6?", "Yes, that's fine. I'll be at the main gate.", "Thanks so much!"],
  ["Hi, does it come with a bag?", "Yes, bag and a spare battery.", "Perfect, requesting now."]
];

/* Listing photos: Wikimedia Commons files (CC licences / public domain),
   loaded straight from Wikimedia. Each file's page on commons.wikimedia.org
   names its author and licence. Items not listed here show the usual
   placeholder, like a real listing posted without photos. */
const IMAGES = {
  "Casio fx-991ZA PLUS calculator": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Casio_fx-991ES_Calculator_New.jpg/960px-Casio_fx-991ES_Calculator_New.jpg",
  "Casio fx-82ZA PLUS II calculators": "https://upload.wikimedia.org/wikipedia/commons/f/f1/Fx_82_MS.jpg",
  "White lab coat, size M": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d8/Lab_coat_and_scrubs.jpg/960px-Lab_coat_and_scrubs.jpg",
  "Lab coats (S, M, L) — new": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/15/Lab_coats.jpg/960px-Lab_coats.jpg",
  "Safety boots, size 8": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cc/S3_safety_footwear.jpg/960px-S3_safety_footwear.jpg",
  "HP 250 G8 laptop (i5, 8GB, 256GB SSD)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5e/HP_Laptop_Notebook.png/960px-HP_Laptop_Notebook.png",
  "Samsung Galaxy Tab A8 with keyboard case": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cd/Samsung_Galaxy_Tab_GT-P1000-7431.jpg/960px-Samsung_Galaxy_Tab_GT-P1000-7431.jpg",
  "Lenovo IdeaPad 3 (Ryzen 5, 16GB)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b8/Lenovo_IdeaPad_Flex14_laptop.jpg/960px-Lenovo_IdeaPad_Flex14_laptop.jpg",
  "A4 hard-cover notebooks (pack of 5)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Working_on_a_planning_session_with_stationery_items%2C_notebook%2C_and_colorful_pencils_on_a_wooden_desk.jpg/960px-Working_on_a_planning_session_with_stationery_items%2C_notebook%2C_and_colorful_pencils_on_a_wooden_desk.jpg",
  "Highlighters, pens and sticky notes bundle": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a6/Artful_highlighter_pens_drawing_on_paper.jpg/960px-Artful_highlighter_pens_drawing_on_paper.jpg",
  "Financial Accounting textbook (Juta)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/Decipher_The_Language_of_Business_-_An_Accounting_Study_by_Victor_Duvera.png/960px-Decipher_The_Language_of_Business_-_An_Accounting_Study_by_Victor_Duvera.png",
  "Mini fridge (Defy, 90 litres)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/Inside_Haier_Mini_Refridgerator_%28Full%29.JPG/960px-Inside_Haier_Mini_Refridgerator_%28Full%29.JPG",
  "Two-plate stove": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/77/Electric_Coil_Stovetop_-_Hot_Plate_%2852445890769%29.jpg/960px-Electric_Coil_Stovetop_-_Hot_Plate_%2852445890769%29.jpg",
  "Microwave (20L, Russell Hobbs)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/95/Panasonic_MICROWAVE_OVEN_NN-GM333W.jpg/960px-Panasonic_MICROWAVE_OVEN_NN-GM333W.jpg",
  "Kettle and toaster set": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/67/Breville.jpg/960px-Breville.jpg",
  "Study desk with drawers": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/Desk%2C_writing_%28AM_1996.33.1-3%29.jpg/960px-Desk%2C_writing_%28AM_1996.33.1-3%29.jpg",
  "Office chair, adjustable": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Buerostuhl_%28fcm%29.jpg/960px-Buerostuhl_%28fcm%29.jpg",
  "Single bed mattress": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/Pillowtop-mattress.jpg/960px-Pillowtop-mattress.jpg",
  "Ladies sneakers, size 5": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6e/Air_Max_97.jpg/960px-Air_Max_97.jpg",
  "Men's formal shoes, size 9": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9b/Crockett_%26_Jones_men%27s_dress_shoes%2C_type_Dalton%2C_black_calf_leather_01.JPG/960px-Crockett_%26_Jones_men%27s_dress_shoes%2C_type_Dalton%2C_black_calf_leather_01.JPG",
  "24\" Samsung monitor": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/24/Computer_monitor_samsung.jpg/960px-Computer_monitor_samsung.jpg",
  "JBL Flip 5 Bluetooth speaker": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d6/G%C5%82o%C5%9Bnik_JBL_Flip_3.jpg/960px-G%C5%82o%C5%9Bnik_JBL_Flip_3.jpg",
  "Extension cord with surge protection": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/45/%2820241007%29_APC_power_strip.jpg/960px-%2820241007%29_APC_power_strip.jpg",
  "Yoga mat and resistance bands": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6d/Yoga_mat.jpg/960px-Yoga_mat.jpg",
  "Mountain bike (26\")": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/Bulls_Wild_Cup_1_%28Modell_2010%29_20100814.jpg/960px-Bulls_Wild_Cup_1_%28Modell_2010%29_20100814.jpg",
  "Clothes rail and hangers": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a7/2008_Taipei_In_Style_Outdoor_Fashion_Show_Clothes_Racks.jpg/960px-2008_Taipei_In_Style_Outdoor_Fashion_Show_Clothes_Racks.jpg",
  "Homemade rusks (1kg packs)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0f/Beskuit.jpg/960px-Beskuit.jpg",
  "Raspberry Pi 4 (4GB) starter kit": "https://upload.wikimedia.org/wikipedia/commons/2/2a/Raspberry_Pi_4_B.png",
  "Kettle (1.7L)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/2023_Czajnik_elektryczny_N%27OVEEN.jpg/960px-2023_Czajnik_elektryczny_N%27OVEEN.jpg",
  "Ironing board and steam iron": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3d/Clothes_iron_on_ironing_board.jpg/960px-Clothes_iron_on_ironing_board.jpg",
  "Casio fx-991ZA PLUS (exam approved)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f9/Casio_fx-991ES-0812.jpg/960px-Casio_fx-991ES-0812.jpg",
  "Casio fx-82ZA PLUS II": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/Casio_FX-82MS.jpg/960px-Casio_FX-82MS.jpg",
  "Graphing calculator (Casio fx-CG50)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/03/Casio_fx-CG50_Front.jpg/960px-Casio_fx-CG50_Front.jpg",
  "Dell Latitude laptop (i5, 8GB)": "https://upload.wikimedia.org/wikipedia/commons/f/f2/Dell_Latitude_D630.jpg",
  "iPad (9th gen) with Apple Pencil": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/Apple_pencil_charging_on_iPad_Pro_12.9_inti_2018_model.jpg/960px-Apple_pencil_charging_on_iPad_Pro_12.9_inti_2018_model.jpg",
  "Canon EOS 2000D camera with 18–55mm lens": "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e1/The_Canon_EOS_Rebel_T7_%282000D%29_Rested_in_the_branch_of_a_tree.jpg/960px-The_Canon_EOS_Rebel_T7_%282000D%29_Rested_in_the_branch_of_a_tree.jpg",
  "Tripod (160cm)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c7/%28Photography_equipment_Tripod_Photo_Camera_Tripod_photograph_in_a_studio%29.jpg/960px-%28Photography_equipment_Tripod_Photo_Camera_Tripod_photograph_in_a_studio%29.jpg",
  "Gazebo 3m × 3m": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/96/DZ6_2894_Night_market_stalls_glow_under_colorful_canopies_as_people_browse_and_scooters_are_parked_nearby_in_a_tree-lined_plaza.jpg/960px-DZ6_2894_Night_market_stalls_glow_under_colorful_canopies_as_people_browse_and_scooters_are_parked_nearby_in_a_tree-lined_plaza.jpg",
  "Chafing dishes (set of 4)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a8/Chafing_Dish_MET_DP216625.jpg/960px-Chafing_Dish_MET_DP216625.jpg",
  "Coffee machine (pod)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/89/Machine_Nespresso_professionnelle_-6.JPG/960px-Machine_Nespresso_professionnelle_-6.JPG",
  "2-person tent": "https://upload.wikimedia.org/wikipedia/commons/3/35/Backpacking_Tent.jpg",
  "Sleeping bag (0°C)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0c/OutDoor_2018%2C_Friedrichshafen_%281X7A0298%29.jpg/960px-OutDoor_2018%2C_Friedrichshafen_%281X7A0298%29.jpg",
  "Rugby ball and cones set": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f8/2019_Rugby_World_Cup_Offficial_Ball.jpg/960px-2019_Rugby_World_Cup_Offficial_Ball.jpg",
  "PlayStation 4 with 2 controllers": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7e/PS4-Console-wDS4.jpg/960px-PS4-Console-wDS4.jpg",
  "Projector (1080p)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/14/InFocus_IN34.jpg/960px-InFocus_IN34.jpg",
  "Portable Wi-Fi router": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d0/Huawei-E5576-320-4G-Reise-Hotspot-LTE-Router.3.jpg/960px-Huawei-E5576-320-4G-Reise-Hotspot-LTE-Router.3.jpg",
  "Sewing machine (Singer)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/49/Woman_sewing_a_face_mask_with_a_Singer_machine_09.jpg/960px-Woman_sewing_a_face_mask_with_a_Singer_machine_09.jpg",
  "Hand trolley": "https://upload.wikimedia.org/wikipedia/commons/5/57/Hand-truck.jpg",
  "Laptop charger (universal, 90W)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2d/Notebook-Computer-AC-Adapter.jpg/960px-Notebook-Computer-AC-Adapter.jpg",
  "Ring light with phone holder": "https://upload.wikimedia.org/wikipedia/commons/8/81/RING_1000x_IMG_5024.jpg",
  "Campbell Biology (12th edition)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2b/Stack_of_multicolored_books_on_a_table.jpg/960px-Stack_of_multicolored_books_on_a_table.jpg",
  "Introduction to Algorithms (CLRS, 3rd ed.)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6f/New_Science_books_-_Flickr_-_brewbooks.jpg/960px-New_Science_books_-_Flickr_-_brewbooks.jpg",
  "Development Studies readers bundle (3 books)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/Stack_of_school_books_on_top_of_a_table.jpg/960px-Stack_of_school_books_on_top_of_a_table.jpg",
  "Overalls, navy, size 34": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1f/%D0%91%D0%B0%D0%B9%D0%BA%D0%BE%D0%BD%D1%83%D1%80%2C_%D1%80%D0%BE%D0%B1%D0%B0_%D0%9A%D1%80%D0%B8%D0%BA%D0%B0%D0%BB%D1%91%D0%B2%D0%B0_%D0%B2_%D0%BC%D1%83%D0%B7%D0%B5%D0%B5.jpg/960px-%D0%91%D0%B0%D0%B9%D0%BA%D0%BE%D0%BD%D1%83%D1%80%2C_%D1%80%D0%BE%D0%B1%D0%B0_%D0%9A%D1%80%D0%B8%D0%BA%D0%B0%D0%BB%D1%91%D0%B2%D0%B0_%D0%B2_%D0%BC%D1%83%D0%B7%D0%B5%D0%B5.jpg",
  "Statistics for Business and Economics": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8c/Blank_books_stacked_on_a_table.jpg/960px-Blank_books_stacked_on_a_table.jpg",
  "Sepedi dictionary and grammar book": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/79/English-English_dictionaries_and_thesaurus_books.JPG/960px-English-English_dictionaries_and_thesaurus_books.JPG",
  "Bedside lamp and desk lamp": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/be/Bedside_Table_Lamp.jpg/960px-Bedside_Table_Lamp.jpg",
  "Formal dresses (size 32/34)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/Deep_petrol_blue_evening_gown_by_Sybil_Connolly.jpg/960px-Deep_petrol_blue_evening_gown_by_Sybil_Connolly.jpg",
  "Braiding hair packs (Darling)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1a/Woman_with_purple_hair_and_lipstick.jpg/960px-Woman_with_purple_hair_and_lipstick.jpg",
  "Wireless mouse and keyboard combo": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1b/Wireless_computer_keyboard_with_mouse_an_USB_receiver.jpg/960px-Wireless_computer_keyboard_with_mouse_an_USB_receiver.jpg",
  "Tempered glass screen protectors": "https://upload.wikimedia.org/wikipedia/commons/9/94/Screen_protector.png",
  "Power bank 20 000mAh": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/49/Aukey_Portable_Battery_Charger_5_2019-05-06.jpg/960px-Aukey_Portable_Battery_Charger_5_2019-05-06.jpg",
  "Hiking backpack (45L)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/4b/Trekking-Rucksack.jpg/960px-Trekking-Rucksack.jpg",
  "Rugby boots, size 10": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/87/Marion_Motley%27s_Shoes_%2811282186155%29.jpg/960px-Marion_Motley%27s_Shoes_%2811282186155%29.jpg",
  "Environmental Science textbook bundle": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6c/Bodo_language_textbooks.jpg/960px-Bodo_language_textbooks.jpg",
  "Graph paper and maths sets": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/07/Russian_school_graph_paper.jpg/960px-Russian_school_graph_paper.jpg",
  "Xitsonga novels for set works": "https://upload.wikimedia.org/wikipedia/commons/f/f0/Paperback-stack.png",
  "Lab coat and safety goggles set": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/79/Empiral_Vision_Grey_goggles.jpg/960px-Empiral_Vision_Grey_goggles.jpg",
  "Soil testing kit": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c7/Soil_Probe_-_Moisture%2C_Temperature_%26_Light.jpg/960px-Soil_Probe_-_Moisture%2C_Temperature_%26_Light.jpg",
  "Gumboots, size 7 and 9": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a0/Wellington_boots_in_Wellington_Road%2C_Oxton.JPG/960px-Wellington_boots_in_Wellington_Road%2C_Oxton.JPG",
  "Statistics textbook (Keller)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/38/Siyavula_Open_Textbooks.jpg/960px-Siyavula_Open_Textbooks.jpg",
  "GIS and Remote Sensing textbook": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bd/Compact_Oxford_English_Dictionary_2.jpg/960px-Compact_Oxford_English_Dictionary_2.jpg",
  "LED party lights set": "https://upload.wikimedia.org/wikipedia/commons/d/d2/LED_par.JPG",
  "Res Swap Shop: clothes and books": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f0/SceneAtClothingSwap.jpg/960px-SceneAtClothingSwap.jpg",
  "Farm produce sale: vegetables and eggs": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/From_the_farm_to_your_plate.jpg/960px-From_the_farm_to_your_plate.jpg",
  "Lost-property sale": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/bb/Found_umbrellas_%281555767152%29.jpg/960px-Found_umbrellas_%281555767152%29.jpg",
  "Paid tutor posts: Computing first-year modules": "https://upload.wikimedia.org/wikipedia/commons/7/75/Students_in_a_computer_lab.jpg",
  "Student pop-up stalls: Heritage Month": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/19/Little_world%2C_Aichi_prefecture_-_African_plaza_-_Frontal_apron_for_marriage-age_women_-_%22iphephethe%22_-_Ndebele_people_in_South_Africa_-_Collected_in_2001.jpg/960px-Little_world%2C_Aichi_prefecture_-_African_plaza_-_Frontal_apron_for_marriage-age_women_-_%22iphephethe%22_-_Ndebele_people_in_South_Africa_-_Collected_in_2001.jpg",
  "Help me understand hypothesis testing (STA101)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a5/Sias_Library_-_Students_Studying_2017.jpg/960px-Sias_Library_-_Students_Studying_2017.jpg",
  "Python tutoring — loops and functions": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/89/Debian_Swirl_Logo_coded_for_Debian_Day_2025.jpg/960px-Debian_Swirl_Logo_coded_for_Debian_Day_2025.jpg",
  "Accounting 1 — explain journals and ledgers": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/cd/Calculator_%285639214967%29.jpg/960px-Calculator_%285639214967%29.jpg",
  "Reading group for isiNdebele literature": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/40/Students_learning_together_%28Unsplash%29.jpg/960px-Students_learning_together_%28Unsplash%29.jpg",
  "Explain SQL joins before my practical": "https://upload.wikimedia.org/wikipedia/commons/a/a1/MySQL_Workbench_editor_screenshot.jpg",
  "Print and bind 3 copies of my research poster": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/93/Notebook.jpg/960px-Notebook.jpg",
  "Type up handwritten interview transcripts": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/db/Handwritten_letters_and_notes_at_the_06-29_exhibit_of_the_Nova_Festival_19.jpg/960px-Handwritten_letters_and_notes_at_the_06-29_exhibit_of_the_Nova_Festival_19.jpg",
  "Set up Excel for my budget practical": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2f/Closeup_of_Excel_Spreadsheet_template_to_track_printouts_%2829911005444%29.jpg/960px-Closeup_of_Excel_Spreadsheet_template_to_track_printouts_%2829911005444%29.jpg",
  "Discrete maths practice partner": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ac/DonZagier-whiteboard.JPG/960px-DonZagier-whiteboard.JPG",
  "Help configuring Git and GitHub": "https://upload.wikimedia.org/wikipedia/commons/b/b9/Mediawiki_core_git_history_sample_in_git_CLI.png",
  "Proofread my teaching-practice portfolio": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5a/Example_of_copyedited_manuscript.jpg/960px-Example_of_copyedited_manuscript.jpg",
  "Explain soil pH lab report format": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Laboratory_analysis_of_soil_samples_from_different_locations_using_universal_indicator.jpg/960px-Laboratory_analysis_of_soil_samples_from_different_locations_using_universal_indicator.jpg",
  "Pick up my laptop from the repair shop in town": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/09/US_Navy_070419-N-9689V-002_Sailors_assigned_to_the_amphibious_assaults_ship_USS_Boxer_%28LHD_4%29%2C_repair_a_laptop_computer_in_the_ship%27s_data_systems_repair_shop.jpg/960px-thumbnail.jpg",
  "Stand in the bank queue for me": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/27/20150705_bank_queue_National_Bank_of_Greece_Galatsi_Athens.jpg/960px-20150705_bank_queue_National_Bank_of_Greece_Galatsi_Athens.jpg",
  "Deliver a cake to KaNyamazane": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9b/A_birthday_cake_2.jpg/960px-A_birthday_cake_2.jpg",
  "Deep clean of a res room before move-out": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/72/Cleaning_a_coffee_table_at_home_with_cleaning_supplies_and_worn_furniture.jpg/960px-Cleaning_a_coffee_table_at_home_with_cleaning_supplies_and_worn_furniture.jpg",
  "Wash and iron a week's laundry": "https://upload.wikimedia.org/wikipedia/commons/c/c1/Wasmand.jpg",
  "Help me move out of my flat in Sonheuwel": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/Moving-boxes.jpg/960px-Moving-boxes.jpg",
  "Carry boxes from res to the storage room": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/EFTA00002252_-_Cluttered_storage_room_filled_with_stacked_cardboard_boxes_tools_and_equipment.jpg/960px-EFTA00002252_-_Cluttered_storage_room_filled_with_stacked_cardboard_boxes_tools_and_equipment.jpg",
  "Replace my cracked phone screen": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9a/Samsung_Galaxy_S2_shattered_screen.jpg/960px-Samsung_Galaxy_S2_shattered_screen.jpg",
  "Fix laptop that won't charge": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7f/Wall-Wart-AC-Adapter.jpg/960px-Wall-Wart-AC-Adapter.jpg",
  "Knotless braids — medium, mid-back": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ac/Hairstyle_-_intricate_braid.jpg/960px-Hairstyle_-_intricate_braid.jpg",
  "Make-up for a formal dinner": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b4/Blush_-_A_selection_of_makeup_brushes.jpg/960px-Blush_-_A_selection_of_makeup_brushes.jpg",
  "Photographer for our society launch": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fe/HK_SYP_%E9%AB%98%E8%A1%97%E7%A4%BE%E5%8D%80%E6%9C%83%E5%A0%82_High_Street_Community_Hall_event_camera_December_2021_Px3_02.jpg/960px-HK_SYP_%E9%AB%98%E8%A1%97%E7%A4%BE%E5%8D%80%E6%9C%83%E5%A0%82_High_Street_Community_Hall_event_camera_December_2021_Px3_02.jpg",
  "Design a poster for a res braai": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/61/Engogo_braai_fire.jpg/960px-Engogo_braai_fire.jpg",
  "Professional headshots for LinkedIn": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/75/Sony_A330_DSLR_Camera.jpg/960px-Sony_A330_DSLR_Camera.jpg",
  "Help planting a veggie garden at home": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Vegetable_Seedlings.jpg/960px-Vegetable_Seedlings.jpg",
  "Help set up sound for a res event": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f7/Mixing_console.jpg/960px-Mixing_console.jpg",
  "Assemble a flat-pack wardrobe": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Sauder2.JPG/960px-Sauder2.JPG",
  "Tutor Sepedi grammar for a friend": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/59/Pen-writing-notes-studying.jpg/960px-Pen-writing-notes-studying.jpg",
  "Edit a 3-minute event highlight video": "https://thumb.wikimedia.org/wikipedia/commons/thumb/c/c7/VSDC_quick_video_styles.jpg/960px-VSDC_quick_video_styles.jpg",
  "Explain microeconomics graphs (ECO102)": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2a/Market_Economy_Supply_and_Demand_Graphic.jpg/960px-Market_Economy_Supply_and_Demand_Graphic.jpg",
  "Fetch a printer from a seller in town": "https://upload.wikimedia.org/wikipedia/commons/e/eb/Epson-inkjet-printer.jpg",
  "Second pair of hands moving a PC desk": "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d4/Computer_desk_Chris-554.jpg/960px-Computer_desk_Chris-554.jpg",
  "Help organising specimens for a lab practical": "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ef/Kew_Herbarium_pressed_and_boxed_specimens_of_Raphia_australis.jpg/960px-Kew_Herbarium_pressed_and_boxed_specimens_of_Raphia_australis.jpg",
  "Kitchen help for a 30-person function": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2a/Man_at_chain_buffet_restaurant.jpg/960px-Man_at_chain_buffet_restaurant.jpg",
  "Iron and fold graduation outfits": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/af/Ironing_a_shirt.jpg/960px-Ironing_a_shirt.jpg",
  "Go through my GIS map layout with me": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5a/QGIS_Interface_Screenshot_with_Map_of_Median_Income_in_Houston_%282010%29.png/960px-QGIS_Interface_Screenshot_with_Map_of_Median_Income_in_Houston_%282010%29.png",
  "Lift to the start of a hiking trail": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/13/Rockfields_near_the_town.JPG/960px-Rockfields_near_the_town.JPG",
  "Someone to quiz me on teaching methods theory": "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e3/A_pair_of_black-framed_glasses.jpg/960px-A_pair_of_black-framed_glasses.jpg",
  "Fix a wobbly bed frame": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f4/Screwdriver_set_with_great_variety_of_bits_and_ratchet_screwdriver.jpg/960px-Screwdriver_set_with_great_variety_of_bits_and_ratchet_screwdriver.jpg",
  "Set up my new laptop": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f6/Lenovo_V330_%281%29.jpg/960px-Lenovo_V330_%281%29.jpg",
  "Cornrows for a 6-year-old": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/Orit%27s_Cornrows_work.jpg/960px-Orit%27s_Cornrows_work.jpg",
  "Afrikaans conversation practice partner": "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9e/Conversation_%285556628632%29.jpg/960px-Conversation_%285556628632%29.jpg",
  "Help with CV and cover letter layout": "https://upload.wikimedia.org/wikipedia/commons/9/90/Resume_logo.jpeg",
  "Queue at the financial aid office for me": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a4/People_waiting_in_line_at_Stena_Line_ferry_terminal%2C_Frederikshavn.jpg/960px-People_waiting_in_line_at_Stena_Line_ferry_terminal%2C_Frederikshavn.jpg",
  "Alter two dresses": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b3/A_Tailor_Sewing_Clothes_in_Her_Shop.jpg/960px-A_Tailor_Sewing_Clothes_in_Her_Shop.jpg",
  "Foundation Phase teaching resources": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/39/Children%27s_number_blocks_being_used_for_learning_to_count_-_51069936953.jpg/960px-Children%27s_number_blocks_being_used_for_learning_to_count_-_51069936953.jpg",
  "Folding tables (set of 2)": "https://upload.wikimedia.org/wikipedia/commons/4/41/LifetimeTable.jpg",
  "Spring Market Day": "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/73/Craft_stalls_of_St_George%27s_Indoor_Market%2C_Belfast_-_geograph.org.uk_-_4184521.jpg/960px-Craft_stalls_of_St_George%27s_Indoor_Market%2C_Belfast_-_geograph.org.uk_-_4184521.jpg",
  "Sell my furniture online for me": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8c/Cozy_living_room_setup_with_a_warm_sofa%2C_coffee_cup%2C_and_an_open_book_in_a_softly_lit_environment.jpg/960px-Cozy_living_room_setup_with_a_warm_sofa%2C_coffee_cup%2C_and_an_open_book_in_a_softly_lit_environment.jpg",
  "Grocery run to Checkers West Acres": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f2/Covid-19_pandemic_food_store_Lordship_Lane_Tottenham%2C_London%2C_England_2.jpg/960px-Covid-19_pandemic_food_store_Lordship_Lane_Tottenham%2C_London%2C_England_2.jpg",
  "Bluetooth PA speaker with 2 mics": "https://upload.wikimedia.org/wikipedia/commons/8/8d/Shure_Wireless_Microphone_SM58.jpg",
  "Collect a parcel from PostNet in Riverside": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/56/Handing_a_package_over_for_delivery.jpg/960px-Handing_a_package_over_for_delivery.jpg"
};

module.exports = {
  IMAGES,
  STUDENTS, LECTURERS, STAFF, PLACES, TASKS, SALES, EQUIPMENT, EVENTS,
  APPLICATION_NOTES, TASK_REVIEWS_FOR_WORKER, TASK_REVIEWS_FOR_POSTER,
  RENTAL_REVIEWS_FOR_OWNER, RENTAL_REVIEWS_FOR_RENTER, TASK_CHATS, SALE_CHATS, RENTAL_CHATS
};
