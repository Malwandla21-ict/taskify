const cloudinary = require("cloudinary").v2;

/* dotenv is already loaded in server.js — no need to call it again here.
   If your env vars are still not loading, check that your .env file
   is in the ROOT of your backend folder (same level as package.json) */

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = cloudinary;