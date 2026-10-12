-- Taskify database structure (tables only, no data)
--
-- Exported on 2026-10-11 (MySQL 8.4.8) by backend/scripts/export-schema.js.
-- 27 tables, in an order where every table comes after the
-- tables it points to, so foreign keys can be created as it goes.
--
-- Load it into an EMPTY database with:
--   cd backend
--   node scripts/import-schema.js
--
-- Every statement is CREATE TABLE IF NOT EXISTS, so running it against a
-- database that already has these tables skips them instead of failing.
-- It never drops or changes an existing table. To bring an OLDER database
-- up to date, use the repair scripts instead:
--   node scripts/repair-all.js

SET NAMES utf8mb4;

-- users
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(120) COLLATE utf8mb4_general_ci NOT NULL,
  `phone_number` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '',
  `profile_photo_url` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `role` enum('user','admin','suspended','banned') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'user',
  `suspension_reason` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `suspended_at` timestamp NULL DEFAULT NULL,
  `ban_reason` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `banned_at` timestamp NULL DEFAULT NULL,
  `is_verified` tinyint(1) NOT NULL DEFAULT '1',
  `rating_average` decimal(3,2) NOT NULL DEFAULT '0.00',
  `total_reviews` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `student_number` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `member_type` enum('Student','Lecturer','Staff') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Student',
  `faculty` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `academic_year` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `account_role` enum('Student','Staff') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Student',
  `bio` text COLLATE utf8mb4_general_ci,
  `skills` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `services` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `lecturer_title` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `years_experience` int DEFAULT NULL,
  `office_location` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `consultation_mode` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `availability_note` text COLLATE utf8mb4_general_ci,
  `email_verification_token_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email_verification_expires` timestamp NULL DEFAULT NULL,
  `password_reset_token_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password_reset_expires` timestamp NULL DEFAULT NULL,
  `totp_secret_encrypted` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `totp_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `totp_backup_codes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `token_version` int NOT NULL DEFAULT '0',
  `failed_login_attempts` int NOT NULL DEFAULT '0',
  `lockout_until` timestamp NULL DEFAULT NULL,
  `login_email_otp_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `login_email_otp_expires` timestamp NULL DEFAULT NULL,
  `login_email_otp_requested_at` timestamp NULL DEFAULT NULL,
  `totp_method` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `has_seen_onboarding` tinyint(1) NOT NULL DEFAULT '0',
  `lecturer_verified` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  CONSTRAINT `users_chk_1` CHECK (json_valid(`skills`)),
  CONSTRAINT `users_chk_2` CHECK (json_valid(`services`)),
  CONSTRAINT `users_chk_3` CHECK (json_valid(`totp_backup_codes`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- admin_allowlist
CREATE TABLE IF NOT EXISTS `admin_allowlist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(120) COLLATE utf8mb4_general_ci NOT NULL,
  `added_by` int DEFAULT NULL,
  `note` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_allowlist_added_by` (`added_by`),
  CONSTRAINT `fk_allowlist_added_by` FOREIGN KEY (`added_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- admin_audit_logs
CREATE TABLE IF NOT EXISTS `admin_audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `admin_id` int NOT NULL,
  `action` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `target_type` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `target_id` int DEFAULT NULL,
  `reason` text COLLATE utf8mb4_general_ci,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_audit_admin` (`admin_id`),
  CONSTRAINT `fk_audit_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `admin_audit_logs_chk_1` CHECK (json_valid(`metadata`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- blocked_content_attempts
CREATE TABLE IF NOT EXISTS `blocked_content_attempts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `content_type` enum('task','sales_item','equipment','event') NOT NULL,
  `user_id` int DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description_snippet` varchar(300) DEFAULT NULL,
  `flagged_categories` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_blocked_content_attempts_user` (`user_id`),
  KEY `idx_blocked_content_attempts_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- equipment
CREATE TABLE IF NOT EXISTS `equipment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `owner_id` int NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci NOT NULL,
  `condition_status` enum('Excellent','Functional','Damaged') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `condition_checked_by` int DEFAULT NULL,
  `condition_checked_at` timestamp NULL DEFAULT NULL,
  `category` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `section` enum('Academic','General') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'General',
  `daily_price` decimal(10,2) NOT NULL,
  `item_value` decimal(10,2) DEFAULT NULL,
  `is_available` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `image_urls` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `moderation_status` enum('clean','pending_review','removed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'clean',
  `moderation_flags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`id`),
  KEY `fk_equipment_owner` (`owner_id`),
  KEY `fk_equipment_condition_checked_by` (`condition_checked_by`),
  CONSTRAINT `fk_equipment_condition_checked_by` FOREIGN KEY (`condition_checked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_equipment_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `equipment_chk_1` CHECK (json_valid(`image_urls`)),
  CONSTRAINT `equipment_chk_2` CHECK (json_valid(`moderation_flags`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- equipment_bookings
CREATE TABLE IF NOT EXISTS `equipment_bookings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `equipment_id` int NOT NULL,
  `renter_id` int NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` enum('Pending','Awaiting Payment','Confirmed','Returned','Not Returned','Cancelled') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `rental_days` int DEFAULT NULL,
  `rental_amount` decimal(10,2) DEFAULT NULL,
  `protection_fee` decimal(10,2) DEFAULT NULL,
  `deposit_amount` decimal(10,2) DEFAULT NULL,
  `trust_level` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `payment_status` enum('Unpaid','Held','Released','Refunded') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `deposit_status` enum('None','Held','Refunded','Disputed') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `condition_status` enum('Pending','OK','Damaged') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `pickup_photos` longtext COLLATE utf8mb4_general_ci,
  `picked_up_at` timestamp NULL DEFAULT NULL,
  `return_photos` longtext COLLATE utf8mb4_general_ci,
  `returned_at` timestamp NULL DEFAULT NULL,
  `damage_note` text COLLATE utf8mb4_general_ci,
  `pickup_condition` enum('Excellent','Functional','Damaged') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `payment_due_at` timestamp NULL DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `return_due_at` timestamp NULL DEFAULT NULL,
  `return_minutes_late` int DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `cancel_reason` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cancel_note` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `policy_version` varchar(40) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `terms_snapshot` text COLLATE utf8mb4_general_ci,
  `return_reminder_sent_at` timestamp NULL DEFAULT NULL,
  `overdue_notified_at` timestamp NULL DEFAULT NULL,
  `overdue_escalated_at` timestamp NULL DEFAULT NULL,
  `problem_reported_at` timestamp NULL DEFAULT NULL,
  `problem_reported_by` enum('renter','owner') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `problem_category` varchar(40) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `problem_note` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `return_attempted_at` timestamp NULL DEFAULT NULL,
  `damage_outcome` enum('renter_not_at_fault','damage_confirmed') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `damage_resolved_at` timestamp NULL DEFAULT NULL,
  `return_wait_notified_at` timestamp NULL DEFAULT NULL,
  `return_reported_at` timestamp NULL DEFAULT NULL,
  `return_report_escalated_at` timestamp NULL DEFAULT NULL,
  `return_disputed_at` timestamp NULL DEFAULT NULL,
  `not_returned_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_equipment_booking_equipment` (`equipment_id`),
  KEY `fk_equipment_booking_renter` (`renter_id`),
  CONSTRAINT `fk_equipment_booking_equipment` FOREIGN KEY (`equipment_id`) REFERENCES `equipment` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_equipment_booking_renter` FOREIGN KEY (`renter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- protection_fund_entries
CREATE TABLE IF NOT EXISTS `protection_fund_entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kind` enum('fee','payout') NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `booking_id` int DEFAULT NULL,
  `owner_id` int DEFAULT NULL,
  `admin_id` int DEFAULT NULL,
  `reason` enum('damage','not_returned') DEFAULT NULL,
  `note` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fund_booking_kind` (`booking_id`,`kind`),
  KEY `idx_fund_kind` (`kind`),
  KEY `fk_fund_owner` (`owner_id`),
  KEY `fk_fund_admin` (`admin_id`),
  CONSTRAINT `fk_fund_booking` FOREIGN KEY (`booking_id`) REFERENCES `equipment_bookings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fund_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fund_admin` FOREIGN KEY (`admin_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- booking_extensions
CREATE TABLE IF NOT EXISTS `booking_extensions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `old_end_date` date NOT NULL,
  `new_end_date` date NOT NULL,
  `extra_days` int NOT NULL,
  `extra_amount` decimal(10,2) NOT NULL,
  `extra_fee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` enum('Requested','Awaiting Payment','Paid','Declined','Cancelled','Expired') NOT NULL DEFAULT 'Requested',
  `payment_due_at` timestamp NULL DEFAULT NULL,
  `responded_at` timestamp NULL DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_booking_extensions_booking` (`booking_id`),
  CONSTRAINT `fk_booking_extensions_booking` FOREIGN KEY (`booking_id`) REFERENCES `equipment_bookings` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- conversations
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `context_type` enum('task','equipment','sale') COLLATE utf8mb4_general_ci NOT NULL,
  `context_id` int NOT NULL,
  `user_a_id` int NOT NULL,
  `user_b_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conversation` (`context_type`,`context_id`,`user_a_id`,`user_b_id`),
  KEY `fk_conv_user_a` (`user_a_id`),
  KEY `fk_conv_user_b` (`user_b_id`),
  CONSTRAINT `fk_conv_user_a` FOREIGN KEY (`user_a_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_conv_user_b` FOREIGN KEY (`user_b_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- events
CREATE TABLE IF NOT EXISTS `events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `organizer_id` int NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci NOT NULL,
  `category` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `section` enum('Academic','General') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'General',
  `location` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `event_date` datetime NOT NULL,
  `capacity` int DEFAULT NULL,
  `image_urls` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `status` enum('Upcoming','Cancelled','Completed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Upcoming',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `moderation_status` enum('clean','pending_review','removed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'clean',
  `moderation_flags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `has_food` tinyint(1) NOT NULL DEFAULT '0',
  `has_refreshments` tinyint(1) NOT NULL DEFAULT '0',
  `listing_authority` varchar(300) COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_events_organizer` (`organizer_id`),
  CONSTRAINT `fk_events_organizer` FOREIGN KEY (`organizer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `events_chk_1` CHECK (json_valid(`image_urls`)),
  CONSTRAINT `events_chk_2` CHECK (json_valid(`moderation_flags`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- event_rsvps
CREATE TABLE IF NOT EXISTS `event_rsvps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_event_user` (`event_id`,`user_id`),
  KEY `fk_rsvp_user` (`user_id`),
  CONSTRAINT `fk_rsvp_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rsvp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- feedback
CREATE TABLE IF NOT EXISTS `feedback` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `kind` enum('idea','problem','consultation','testing') NOT NULL,
  `message` varchar(2000) NOT NULL,
  `status` enum('New','Reviewed') NOT NULL DEFAULT 'New',
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_feedback_status` (`status`,`created_at`),
  KEY `fk_feedback_user` (`user_id`),
  KEY `fk_feedback_reviewer` (`reviewed_by`),
  CONSTRAINT `fk_feedback_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- flagged_uploads
CREATE TABLE IF NOT EXISTS `flagged_uploads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `image_url` varchar(500) COLLATE utf8mb4_general_ci NOT NULL,
  `flagged_categories` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_flagged_uploads_url` (`image_url`(255)),
  CONSTRAINT `flagged_uploads_chk_1` CHECK (json_valid(`flagged_categories`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- lecturer_endorsements
CREATE TABLE IF NOT EXISTS `lecturer_endorsements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `lecturer_id` int NOT NULL,
  `endorsed_user_id` int NOT NULL,
  `endorsement_type` enum('Tutoring','Toolkit','General') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'General',
  `context_type` enum('sales_item','equipment','task','event') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `context_id` int DEFAULT NULL,
  `message` text COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_endorsement_lecturer` (`lecturer_id`),
  KEY `fk_endorsement_student` (`endorsed_user_id`),
  CONSTRAINT `fk_endorsement_lecturer` FOREIGN KEY (`lecturer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_endorsement_student` FOREIGN KEY (`endorsed_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- messages
CREATE TABLE IF NOT EXISTS `messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversation_id` int NOT NULL,
  `sender_id` int NOT NULL,
  `body` text COLLATE utf8mb4_general_ci NOT NULL,
  `is_flagged` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_msg_conversation` (`conversation_id`),
  KEY `fk_msg_sender` (`sender_id`),
  KEY `idx_messages_unread` (`conversation_id`,`read_at`,`sender_id`),
  CONSTRAINT `fk_msg_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- notifications
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `message` text COLLATE utf8mb4_general_ci NOT NULL,
  `context_type` enum('task','equipment_booking','sales_item','event') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `context_id` int DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- offers
CREATE TABLE IF NOT EXISTS `offers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `context_type` enum('task','sales_item') NOT NULL,
  `context_id` int NOT NULL,
  `offerer_id` int NOT NULL,
  `owner_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `message` varchar(300) DEFAULT NULL,
  `last_proposed_by` enum('offerer','owner') NOT NULL DEFAULT 'offerer',
  `counter_rounds` int NOT NULL DEFAULT '0',
  `status` enum('Pending','Accepted','Declined','Withdrawn','Expired') NOT NULL DEFAULT 'Pending',
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_offers_listing` (`context_type`,`context_id`,`status`),
  KEY `idx_offers_offerer` (`offerer_id`,`status`),
  KEY `idx_offers_owner` (`owner_id`,`status`),
  CONSTRAINT `fk_offers_offerer` FOREIGN KEY (`offerer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_offers_owner` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- offer_history
CREATE TABLE IF NOT EXISTS `offer_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `offer_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `proposed_by` enum('offerer','owner') NOT NULL,
  `message` varchar(300) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_offer_history_offer` (`offer_id`),
  CONSTRAINT `fk_offer_history_offer` FOREIGN KEY (`offer_id`) REFERENCES `offers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- tasks
CREATE TABLE IF NOT EXISTS `tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci NOT NULL,
  `category` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `section` enum('Academic','General') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'General',
  `price` decimal(10,2) NOT NULL,
  `location` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Posted','Accepted','In Progress','Awaiting Confirmation','Disputed','Completed','Cancelled') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Posted',
  `urgent` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int NOT NULL,
  `accepted_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `image_urls` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `moderation_status` enum('clean','pending_review','removed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'clean',
  `moderation_flags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `awaiting_confirmation_at` timestamp NULL DEFAULT NULL,
  `review_reminder_sent_at` timestamp NULL DEFAULT NULL,
  `review_escalated_at` timestamp NULL DEFAULT NULL,
  `disputed_at` timestamp NULL DEFAULT NULL,
  `dispute_reason` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dispute_outcome` enum('released','refunded','rework','poster_confirmed') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dispute_resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_tasks_created_by` (`created_by`),
  KEY `fk_tasks_accepted_by` (`accepted_by`),
  CONSTRAINT `fk_tasks_accepted_by` FOREIGN KEY (`accepted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tasks_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `tasks_chk_1` CHECK (json_valid(`image_urls`)),
  CONSTRAINT `tasks_chk_2` CHECK (json_valid(`moderation_flags`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- payments
CREATE TABLE IF NOT EXISTS `payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('Held','Released','Refunded','Cancelled') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Held',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `task_id` (`task_id`),
  CONSTRAINT `fk_payments_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- push_subscriptions
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `endpoint` text NOT NULL,
  `endpoint_hash` char(64) NOT NULL,
  `p256dh` varchar(255) NOT NULL,
  `auth` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_push_endpoint_hash` (`endpoint_hash`),
  KEY `idx_push_subscriptions_user` (`user_id`),
  CONSTRAINT `fk_push_subscriptions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- reports
CREATE TABLE IF NOT EXISTS `reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reporter_id` int NOT NULL,
  `reported_user_id` int NOT NULL,
  `context_type` enum('task','equipment','equipment_booking','sales_item','event') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `context_id` int DEFAULT NULL,
  `reason` text COLLATE utf8mb4_general_ci NOT NULL,
  `category` enum('payment','damaged_item','not_as_described','no_show','scam','harassment','inappropriate','other') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'other',
  `status` enum('Pending','Resolved') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `message_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_reports_reporter` (`reporter_id`),
  KEY `fk_reports_reported_user` (`reported_user_id`),
  KEY `fk_reports_message` (`message_id`),
  CONSTRAINT `fk_reports_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reports_reported_user` FOREIGN KEY (`reported_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reports_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- reviews
CREATE TABLE IF NOT EXISTS `reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_id` int DEFAULT NULL,
  `booking_id` int DEFAULT NULL,
  `reviewer_id` int NOT NULL,
  `reviewee_id` int NOT NULL,
  `rating` int NOT NULL,
  `comment` text COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_task_reviewer` (`task_id`,`reviewer_id`),
  UNIQUE KEY `uq_booking_reviewer` (`booking_id`,`reviewer_id`),
  KEY `fk_reviews_reviewer` (`reviewer_id`),
  KEY `fk_reviews_reviewee` (`reviewee_id`),
  CONSTRAINT `fk_reviews_booking` FOREIGN KEY (`booking_id`) REFERENCES `equipment_bookings` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_reviewee` FOREIGN KEY (`reviewee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reviews_task` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_rating` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- sales_items
CREATE TABLE IF NOT EXISTS `sales_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `seller_id` int NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci NOT NULL,
  `category` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `section` enum('Academic','General') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Academic',
  `price` decimal(10,2) NOT NULL,
  `condition_status` enum('New','Excellent','Good','Fair','Used') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Good',
  `location` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('Available','Reserved','Sold') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'Available',
  `quantity` int NOT NULL DEFAULT 1,
  `quantity_sold` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `image_urls` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `moderation_status` enum('clean','pending_review','removed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'clean',
  `moderation_flags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`id`),
  KEY `seller_id` (`seller_id`),
  CONSTRAINT `sales_items_ibfk_1` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`),
  CONSTRAINT `sales_items_chk_1` CHECK (json_valid(`image_urls`)),
  CONSTRAINT `sales_items_chk_2` CHECK (json_valid(`moderation_flags`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- sale_orders
CREATE TABLE IF NOT EXISTS `sale_orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sales_item_id` int NOT NULL,
  `buyer_id` int NOT NULL,
  `seller_id` int NOT NULL,
  `item_price` decimal(10,2) NOT NULL,
  `protection_fee` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(10,2) NOT NULL,
  `handover_code` char(4) NOT NULL,
  `code_attempts` int NOT NULL DEFAULT '0',
  `status` enum('Held','Disputed','Released','Refunded') NOT NULL DEFAULT 'Held',
  `cancelled_by` enum('buyer','seller') DEFAULT NULL,
  `released_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `disputed_at` timestamp NULL DEFAULT NULL,
  `disputed_by` enum('buyer','seller') DEFAULT NULL,
  `dispute_category` varchar(40) DEFAULT NULL,
  `dispute_reason` varchar(500) DEFAULT NULL,
  `dispute_outcome` enum('released','refunded','retry','handed_over','seller_refunded') DEFAULT NULL,
  `dispute_resolved_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sale_orders_item` (`sales_item_id`),
  KEY `idx_sale_orders_buyer` (`buyer_id`),
  KEY `idx_sale_orders_seller` (`seller_id`),
  CONSTRAINT `fk_sale_orders_buyer` FOREIGN KEY (`buyer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sale_orders_item` FOREIGN KEY (`sales_item_id`) REFERENCES `sales_items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sale_orders_seller` FOREIGN KEY (`seller_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- security_events
CREATE TABLE IF NOT EXISTS `security_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `email` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `event` varchar(60) COLLATE utf8mb4_general_ci NOT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_security_events_user` (`user_id`),
  CONSTRAINT `fk_security_events_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `security_events_chk_1` CHECK (json_valid(`metadata`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- trusted_devices
CREATE TABLE IF NOT EXISTS `trusted_devices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `device_label` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_trusted_device_token` (`token_hash`),
  KEY `idx_trusted_devices_user` (`user_id`),
  CONSTRAINT `fk_trusted_devices_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- user_acknowledgements
CREATE TABLE IF NOT EXISTS `user_acknowledgements` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `kind` varchar(60) COLLATE utf8mb4_general_ci NOT NULL,
  `version` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `context_type` varchar(40) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `context_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ack_user` (`user_id`,`created_at`),
  KEY `idx_ack_context` (`context_type`,`context_id`),
  CONSTRAINT `fk_ack_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
