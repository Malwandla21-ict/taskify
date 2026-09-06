const cloudinary = require("../config/cloudinary");
const contentModerationService = require("../services/contentModeration.service");

function assertCloudinaryConfigured() {
  const required = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET"
  ];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    const error = new Error(
      "Image uploads are not configured. Add the Cloudinary credentials to the backend .env file."
    );
    error.statusCode = 503;
    throw error;
  }
}

function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        transformation: [
          { width: 1200, height: 900, crop: "limit" },
          { quality: "auto:good" },
          { fetch_format: "auto" }
        ]
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return reject(error);
        }
        console.log("Cloudinary upload success:", result.secure_url);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

async function uploadProfilePhoto(file) {
  if (!file) return null;
  assertCloudinaryConfigured();
  const result = await uploadToCloudinary(file.buffer, "taskify/profile-photos");
  return result.secure_url;
}

async function uploadImages(req, res, next) {
  try {
    assertCloudinaryConfigured();

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "No images provided." });
    }

    const allowedFolders = new Set(["tasks", "equipment", "sales", "events"]);
    const requestedFolder = String(req.query.folder || "general").toLowerCase();
    const folder = `taskify/${allowedFolders.has(requestedFolder) ? requestedFolder : "general"}`;

    /* Moderate every image before any of them reach Cloudinary — a severe
       hit means none of this batch gets uploaded at all, rather than
       storing it even briefly. Checked as a base64 data URI straight from
       the in-memory buffer, so nothing touches disk either. */
    const moderationResults = await Promise.all(
      req.files.map(file => {
        const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
        return contentModerationService.evaluateImage(dataUri);
      })
    );

    const severeIndex = moderationResults.findIndex(result => result.severe);
    if (severeIndex !== -1) {
      return res.status(422).json({
        success: false,
        message: `Image ${severeIndex + 1} violates our content policy and cannot be uploaded. Remove it and try again.`
      });
    }

    const uploadPromises = req.files.map(file =>
      uploadToCloudinary(file.buffer, folder)
    );

    const results = await Promise.all(uploadPromises);
    const urls    = results.map(r => r.secure_url);

    /* Borderline (non-severe) hits still upload — recorded here so that
       whichever task/sales item/equipment listing/event ends up using
       this URL gets flagged for admin review at creation time. */
    await Promise.all(
      moderationResults.map((result, index) =>
        result.flagged
          ? contentModerationService.recordFlaggedUpload(urls[index], result.flaggedCategories)
          : Promise.resolve()
      )
    );

    return res.status(200).json({
      success: true,
      message: "Images uploaded successfully.",
      data: { urls }
    });
  } catch (error) {
    console.error("Upload controller error:", error);
    next(error);
  }
}

module.exports = { uploadImages, uploadProfilePhoto };