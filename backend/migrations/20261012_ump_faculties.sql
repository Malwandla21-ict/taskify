-- University of Mpumalanga faculty names (2026-10-12)
-- Doc copy of what backend/scripts/repair-ump-faculties.js applies (data
-- only, no schema change). Run the script instead of this file.
UPDATE users SET faculty = 'Faculty of Agriculture and Natural Sciences' WHERE faculty = 'Agriculture & Environmental Sciences';
UPDATE users SET faculty = 'Faculty of Economics, Development and Business Sciences' WHERE faculty IN ('Economics, Development & Business Sciences', 'Hospitality & Tourism');
UPDATE users SET faculty = 'Faculty of Education' WHERE faculty = 'Education';
UPDATE users SET faculty = 'Faculty of Agriculture and Natural Sciences' WHERE faculty = 'ICT' AND member_type = 'Student';
UPDATE users SET faculty = 'ICT Services' WHERE faculty = 'ICT';
