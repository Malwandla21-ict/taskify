const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const dotenv     = require("dotenv");

const authRoutes            = require("./routes/auth.routes");
const taskRoutes            = require("./routes/task.routes");
const reviewRoutes          = require("./routes/review.routes");
const reportRoutes          = require("./routes/report.routes");
const equipmentRoutes       = require("./routes/equipment.routes");
const userRoutes            = require("./routes/user.routes");
const salesRoutes           = require("./routes/sales.routes");
const notificationRoutes    = require("./routes/notification.routes");
const uploadRoutes          = require("./routes/upload.routes");
const eventRoutes           = require("./routes/event.routes");
const conversationRoutes    = require("./routes/conversation.routes");
const adminRoutes           = require("./routes/admin.routes");
const adminMessagingRoutes  = require("./routes/adminMessaging.routes");
const adminAllowlistRoutes  = require("./routes/adminAllowlist.routes");
const lecturerRoutes        = require("./routes/lecturer.routes");

const { errorHandler }   = require("./middleware/error.middleware");
const { apiLimiter }     = require("./middleware/rateLimit.middleware");

dotenv.config();

const app = express();

/* Trust the first hop proxy (Render/Railway/Nginx/etc. in production) so
   express-rate-limit and our own IP-based lockout logging see the real
   client IP from X-Forwarded-For instead of the proxy's own address. */
app.set("trust proxy", 1);

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", apiLimiter);

app.get("/", (req, res) => {
  res.json({ success: true, message: "Taskify backend is running" });
});

app.use("/api/auth",            authRoutes);
app.use("/api/tasks",           taskRoutes);
app.use("/api/reviews",         reviewRoutes);
app.use("/api/reports",         reportRoutes);
app.use("/api/equipment",       equipmentRoutes);
app.use("/api/users",           userRoutes);
app.use("/api/sales",           salesRoutes);
app.use("/api/notifications",   notificationRoutes);
app.use("/api/upload",          uploadRoutes);
app.use("/api/events",          eventRoutes);
app.use("/api/conversations",   conversationRoutes);
app.use("/api/admin",           adminRoutes);
app.use("/api/admin/messages",  adminMessagingRoutes);
app.use("/api/admin/allowlist", adminAllowlistRoutes);
app.use("/api/lecturer",        lecturerRoutes);

app.use(errorHandler);

module.exports = app;
