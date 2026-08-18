// backend/scripts/repair-messaging-schema.js
const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function columnExists(pool, table, column) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column]
  );
  return rows[0].count > 0;
}

async function tableExists(pool, table) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return rows[0].count > 0;
}

async function repair() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    if (!(await tableExists(pool, "conversations"))) {
      await pool.execute(`
        CREATE TABLE conversations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          context_type ENUM('task', 'equipment', 'sale') NOT NULL,
          context_id INT NOT NULL,
          user_a_id INT NOT NULL,
          user_b_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_conv_user_a FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_conv_user_b FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT uq_conversation UNIQUE (context_type, context_id, user_a_id, user_b_id)
        )
      `);
      console.log("Created 'conversations' table.");
    } else {
      console.log("'conversations' table already exists — skipped.");
    }

    if (!(await tableExists(pool, "messages"))) {
      await pool.execute(`
        CREATE TABLE messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          conversation_id INT NOT NULL,
          sender_id INT NOT NULL,
          body TEXT NOT NULL,
          is_flagged TINYINT(1) NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_msg_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log("Created 'messages' table.");
    } else {
      console.log("'messages' table already exists — skipped.");
    }

    if (!(await tableExists(pool, "reports"))) {
      throw new Error("'reports' table does not exist. Run schema.sql first.");
    }

    if (!(await columnExists(pool, "reports", "task_id"))) {
      await pool.execute(`ALTER TABLE reports ADD COLUMN task_id INT DEFAULT NULL`);
      console.log("Added missing 'task_id' column to 'reports' (schema drift detected).");
    } else {
      console.log("'reports.task_id' already exists — skipped.");
    }

    if (!(await columnExists(pool, "reports", "message_id"))) {
      await pool.execute(`ALTER TABLE reports ADD COLUMN message_id INT DEFAULT NULL`);
      await pool.execute(`
        ALTER TABLE reports
          ADD CONSTRAINT fk_reports_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
      `);
      console.log("Added 'message_id' column and FK to 'reports'.");
    } else {
      console.log("'reports.message_id' already exists — skipped.");
    }

    console.log("Messaging schema repair complete.");
  } finally {
    await pool.end();
  }
}

repair().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});