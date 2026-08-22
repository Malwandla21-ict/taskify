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

const { errorHandler }   = require("./middleware/error.middleware");

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use(errorHandler);

module.exports = app;