const pool = require("../config/db");
const auditLogService = require("./auditlog.service");
const { parseRange, within, SAST } = require("./analytics.service");
const { CATEGORY_LABELS } = require("./report.service");
const { maskContactDetails } = require("../utils/contactMask");

/*
  Downloadable admin reports (CSV — opens in Excel or Google Sheets).

  Personal information is kept to what an admin needs (POPIA's "minimum
  necessary"): names and account IDs only — no emails, phone numbers,
  student numbers, passwords, 2FA details or handover codes. Every export
  is written to the admin audit log (who downloaded what, for which dates).

  Cells that start with = + - @ (or a tab/return) are prefixed with ' so a
  listing title like "=HYPERLINK(...)" can't run as a spreadsheet formula
  when the file is opened ("CSV injection").
*/

const sast = (column) => `DATE_FORMAT(CONVERT_TZ(${column}, @@session.time_zone, '${SAST}'), '%Y-%m-%d %H:%i')`;
const money = (v) => (v == null ? "" : Number(v).toFixed(2));
const who = (name, id) => (id ? `${name || "Deleted user"} (#${id})` : "");
/* Free text people or older admin notes typed (report reasons, audit notes)
   can contain emails or phone numbers — hidden in every download. */
const safeText = (text) => maskContactDetails(text || "").text;

function csvCell(value) {
  if (value == null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(columns, rows) {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.key])).join(","));
  /* BOM so Excel opens it as UTF-8 (names with accents, "R" amounts). */
  return "﻿" + lines.join("\r\n") + "\r\n";
}

const REPORTS = {
  transactions: {
    title: "Transactions",
    columns: [
      ["type", "Type"], ["id", "ID"], ["title", "Item"], ["created", "Created (SAST)"], ["status", "Status"],
      ["payment", "Payment status (demo)"], ["owner", "Poster / seller / owner"], ["counterparty", "Worker / buyer / renter"],
      ["amount", "Amount (R)"], ["fee", "Protection fee (R)"], ["deposit", "Deposit (R)"],
      ["closed", "Completed / released (SAST)"], ["notes", "Notes"]
    ],
    async rows(range) {
      const p = [range.startAt, range.endAt];
      const [tasks] = await pool.query(
        `SELECT t.id, t.title, ${sast("t.created_at")} AS created, t.status, pay.status AS payment, t.price AS amount,
                poster.full_name AS owner_name, t.created_by AS owner_id, worker.full_name AS other_name, t.accepted_by AS other_id,
                CASE WHEN pay.status = 'Released' THEN ${sast("pay.updated_at")} END AS closed, t.dispute_outcome
         FROM tasks t
         LEFT JOIN payments pay ON pay.task_id = t.id
         LEFT JOIN users poster ON poster.id = t.created_by
         LEFT JOIN users worker ON worker.id = t.accepted_by
         WHERE ${within("t.created_at")}`, p
      );
      const [sales] = await pool.query(
        `SELECT so.id, si.title, ${sast("so.created_at")} AS created, so.status, so.item_price AS amount, so.protection_fee AS fee,
                seller.full_name AS owner_name, so.seller_id AS owner_id, buyer.full_name AS other_name, so.buyer_id AS other_id,
                ${sast("so.released_at")} AS closed, so.code_attempts
         FROM sale_orders so
         INNER JOIN sales_items si ON si.id = so.sales_item_id
         LEFT JOIN users seller ON seller.id = so.seller_id
         LEFT JOIN users buyer ON buyer.id = so.buyer_id
         WHERE ${within("so.created_at")}`, p
      );
      const [rentals] = await pool.query(
        `SELECT eb.id, e.name AS title, ${sast("eb.created_at")} AS created, eb.status, eb.payment_status AS payment,
                eb.rental_amount AS amount, eb.protection_fee AS fee, eb.deposit_amount AS deposit, eb.deposit_status,
                owner.full_name AS owner_name, e.owner_id, renter.full_name AS other_name, eb.renter_id AS other_id,
                ${sast("eb.returned_at")} AS closed, eb.condition_status,
                DATE_FORMAT(eb.start_date, '%Y-%m-%d') AS start_text, DATE_FORMAT(eb.end_date, '%Y-%m-%d') AS end_text
         FROM equipment_bookings eb
         INNER JOIN equipment e ON e.id = eb.equipment_id
         LEFT JOIN users owner ON owner.id = e.owner_id
         LEFT JOIN users renter ON renter.id = eb.renter_id
         WHERE ${within("eb.created_at")}`, p
      );
      return [
        ...tasks.map((r) => ({
          type: "Task", id: r.id, title: r.title, created: r.created, status: r.status, payment: r.payment || "",
          owner: who(r.owner_name, r.owner_id), counterparty: who(r.other_name, r.other_id),
          amount: money(r.amount), fee: "", deposit: "", closed: r.closed || "",
          notes: r.dispute_outcome ? `Dispute: ${r.dispute_outcome}` : ""
        })),
        ...sales.map((r) => ({
          type: "Sale", id: r.id, title: r.title, created: r.created, status: r.status, payment: r.status,
          owner: who(r.owner_name, r.owner_id), counterparty: who(r.other_name, r.other_id),
          amount: money(r.amount), fee: money(r.fee), deposit: "", closed: r.closed || "",
          notes: Number(r.code_attempts) ? `${r.code_attempts} wrong handover code attempt(s)` : ""
        })),
        ...rentals.map((r) => ({
          type: "Rental", id: r.id, title: r.title, created: r.created, status: r.status, payment: r.payment || "",
          owner: who(r.owner_name, r.owner_id), counterparty: who(r.other_name, r.other_id),
          amount: money(r.amount), fee: money(r.fee), deposit: money(r.deposit), closed: r.closed || "",
          notes: [`${r.start_text} to ${r.end_text}`, r.deposit_status && r.deposit_status !== "None" ? `Deposit ${r.deposit_status}` : "",
                  r.condition_status ? `Condition ${r.condition_status}` : ""].filter(Boolean).join("; ")
        }))
      ].sort((a, b) => String(a.created).localeCompare(String(b.created)));
    }
  },

  users: {
    title: "Users",
    columns: [
      ["id", "User ID"], ["name", "Name"], ["type", "Account type"], ["role", "Status"], ["lecturer", "Lecturer verified"],
      ["emailVerified", "Email verified"], ["joined", "Joined (SAST)"], ["lastLogin", "Last sign-in (SAST)"],
      ["tasksPosted", "Tasks posted"], ["listings", "Sales + rental listings"], ["rating", "Average rating"]
    ],
    async rows(range) {
      const [rows] = await pool.query(
        `SELECT u.id, u.full_name, u.member_type, u.role, u.lecturer_verified, u.is_verified, u.rating_average, u.total_reviews,
                ${sast("u.created_at")} AS joined,
                (SELECT ${sast("MAX(se.created_at)")} FROM security_events se
                 WHERE se.user_id = u.id AND se.event IN ('login_success', 'login_trusted_device')) AS last_login,
                (SELECT COUNT(*) FROM tasks t WHERE t.created_by = u.id) AS tasks_posted,
                (SELECT COUNT(*) FROM sales_items s WHERE s.seller_id = u.id) + (SELECT COUNT(*) FROM equipment e WHERE e.owner_id = u.id) AS listings
         FROM users u WHERE ${within("u.created_at")} ORDER BY u.created_at`,
        [range.startAt, range.endAt]
      );
      return rows.map((r) => ({
        id: r.id, name: r.full_name, type: r.member_type || "Student", role: r.role,
        lecturer: r.member_type === "Lecturer" ? (Number(r.lecturer_verified) ? "Yes" : "No") : "",
        emailVerified: Number(r.is_verified) ? "Yes" : "No", joined: r.joined, lastLogin: r.last_login || "",
        tasksPosted: Number(r.tasks_posted), listings: Number(r.listings),
        rating: Number(r.total_reviews) ? Number(r.rating_average).toFixed(2) : ""
      }));
    }
  },

  reports: {
    title: "Reports and disputes",
    columns: [
      ["id", "Report ID"], ["created", "Reported (SAST)"], ["category", "Problem type"], ["about", "About"],
      ["reported", "Reported user"], ["reporter", "Reported by"], ["status", "Status"], ["dispute", "Task dispute outcome"],
      ["reason", "What they said"]
    ],
    async rows(range) {
      const [rows] = await pool.query(
        `SELECT r.id, ${sast("r.created_at")} AS created, r.category, r.context_type, r.context_id, r.status, r.reason,
                reported.full_name AS reported_name, r.reported_user_id, reporter.full_name AS reporter_name, r.reporter_id,
                t.title AS task_title, t.dispute_outcome
         FROM reports r
         LEFT JOIN users reported ON reported.id = r.reported_user_id
         LEFT JOIN users reporter ON reporter.id = r.reporter_id
         LEFT JOIN tasks t ON r.context_type = 'task' AND t.id = r.context_id
         WHERE ${within("r.created_at")} ORDER BY r.created_at`,
        [range.startAt, range.endAt]
      );
      return rows.map((r) => ({
        id: r.id, created: r.created, category: CATEGORY_LABELS[r.category] || r.category || "",
        about: r.context_type ? `${r.context_type} #${r.context_id}${r.task_title ? ` (${r.task_title})` : ""}` : "",
        reported: who(r.reported_name, r.reported_user_id), reporter: who(r.reporter_name, r.reporter_id),
        status: r.status, dispute: r.dispute_outcome || "", reason: safeText(r.reason)
      }));
    }
  },

  moderation: {
    title: "Moderation",
    columns: [["when", "When (SAST)"], ["kind", "Kind"], ["type", "Listing type"], ["id", "Listing ID"], ["title", "Title"],
              ["user", "User"], ["status", "Status"], ["categories", "Flagged categories"]],
    async rows(range) {
      const p = [range.startAt, range.endAt];
      const [blocked] = await pool.query(
        `SELECT ${sast("b.created_at")} AS at, b.content_type, b.title, b.flagged_categories, u.full_name, b.user_id
         FROM blocked_content_attempts b LEFT JOIN users u ON u.id = b.user_id WHERE ${within("b.created_at")}`, p
      );
      const flaggedSql = (table, type, titleCol, ownerCol) =>
        `SELECT ${sast("x.created_at")} AS at, '${type}' AS content_type, x.id, x.${titleCol} AS title, x.moderation_status, x.moderation_flags,
                u.full_name, x.${ownerCol} AS user_id
         FROM ${table} x LEFT JOIN users u ON u.id = x.${ownerCol}
         WHERE x.moderation_flags IS NOT NULL AND ${within("x.created_at")}`;
      const [flagged] = await pool.query(
        [flaggedSql("tasks", "task", "title", "created_by"), flaggedSql("sales_items", "sales_item", "title", "seller_id"),
         flaggedSql("equipment", "equipment", "name", "owner_id"), flaggedSql("events", "event", "title", "organizer_id")].join(" UNION ALL "),
        [...p, ...p, ...p, ...p]
      );
      const cats = (v) => { try { return (typeof v === "string" ? JSON.parse(v) : v || []).join("; "); } catch { return String(v || ""); } };
      return [
        ...blocked.map((r) => ({ when: r.at, kind: "Blocked before posting", type: r.content_type, id: "", title: safeText(r.title),
                                 user: who(r.full_name, r.user_id), status: "Blocked", categories: cats(r.flagged_categories) })),
        ...flagged.map((r) => ({ when: r.at, kind: "Flagged for review", type: r.content_type, id: r.id, title: r.title,
                                 user: who(r.full_name, r.user_id), status: r.moderation_status, categories: cats(r.moderation_flags) }))
      ].sort((a, b) => String(a.when).localeCompare(String(b.when)));
    }
  },

  audit: {
    title: "Admin audit log",
    columns: [["when", "When (SAST)"], ["admin", "Admin"], ["action", "Action"], ["target", "Target"], ["reason", "Reason / note"]],
    async rows(range) {
      const [rows] = await pool.query(
        `SELECT ${sast("a.created_at")} AS at, a.action, a.target_type, a.target_id, a.reason, u.full_name, a.admin_id
         FROM admin_audit_logs a LEFT JOIN users u ON u.id = a.admin_id
         WHERE ${within("a.created_at")} ORDER BY a.created_at`,
        [range.startAt, range.endAt]
      );
      return rows.map((r) => ({
        when: r.at, admin: who(r.full_name, r.admin_id), action: r.action,
        target: `${r.target_type}${r.target_id ? ` #${r.target_id}` : ""}`, reason: safeText(r.reason)
      }));
    }
  }
};

const REPORT_TYPES = Object.keys(REPORTS);

async function buildExport(type, query, adminId) {
  const report = REPORTS[type];
  if (!report) {
    const error = new Error(`Unknown report. Choose one of: ${REPORT_TYPES.join(", ")}.`); error.statusCode = 400; throw error;
  }
  const range = parseRange(query);
  const rows = await report.rows(range);
  const columns = report.columns.map(([key, label]) => ({ key, label }));

  await auditLogService.createAuditLog({
    adminId,
    action: `export.${type}`,
    targetType: "report",
    targetId: null,
    reason: `Downloaded "${report.title}" for ${range.from} to ${range.to} (${rows.length} row${rows.length === 1 ? "" : "s"}).`
  });

  return {
    filename: `taskify-${type}-${range.from}-to-${range.to}.csv`,
    rowCount: rows.length,
    csv: toCsv(columns, rows)
  };
}

module.exports = { buildExport, REPORT_TYPES, toCsv, csvCell };
