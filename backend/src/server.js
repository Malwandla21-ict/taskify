const dotenv = require("dotenv");
dotenv.config();

const { validateEnv } = require("./config/env");
validateEnv();

const app = require("./app");
const pool = require("./config/db");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    const connection = await pool.getConnection();
    console.log("Database connected successfully.");
    connection.release();

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });

    /* Review reminders etc. — see jobs/scheduler.js. Started here (not in
       app.js) so the automated tests never run it in the background. */
    require("./jobs/scheduler").startScheduler();
  } catch (error) {
    console.error("Database connection failed:", error.message);
  }
}

startServer();
