const cloudinary = require("../config/cloudinary");

/* Upload a single file buffer to Cloudinary */
function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,                    /* organise by type: taskify/tasks, taskify/sales etc */
        resource_type: "image",
        transformation: [
          { width: 1200, height: 900, crop: "limit" }, /* cap dimensions */
          { quality: "auto:good" },                     /* auto compress    */
          { fetch_format: "auto" }                      /* serve WebP/AVIF  */
        ]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

async function uploadImages(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No images provided."
      });
    }

    /* folder comes from query param e.g. ?folder=tasks */
    const folder = `taskify/${req.query.folder || "general"}`;

    /* Upload all files in parallel */
    const uploadPromises = req.files.map(file =>
      uploadToCloudinary(file.buffer, folder)
    );

    const results = await Promise.all(uploadPromises);

    const urls = results.map(r => r.secure_url);

    return res.status(200).json({
      success: true,
      message: "Images uploaded successfully.",
      data: { urls }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { uploadImages };