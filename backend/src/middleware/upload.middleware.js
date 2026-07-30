const multer = require("multer");

/* Store in memory — files go straight to Cloudinary, never touch disk */
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

  if (!allowed.includes(file.mimetype)) {
    return cb(new Error("Only JPEG, PNG and WebP images are allowed."), false);
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, /* 5MB per file */
    files: 5                    /* max 5 images */
  }
});

module.exports = upload;