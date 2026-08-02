-- Run once against the existing Taskify database before deploying profile photos.
ALTER TABLE users
  ADD COLUMN profile_photo_url VARCHAR(500) NULL AFTER phone_number;
