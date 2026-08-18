const cloudinary = require("../config/cloudinary");

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

    const uploadPromises = req.files.map(file =>
      uploadToCloudinary(file.buffer, folder)
    );

    const results = await Promise.all(uploadPromises);
    const urls    = results.map(r => r.secure_url);

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