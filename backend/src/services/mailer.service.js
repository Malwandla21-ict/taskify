const nodemailer = require("nodemailer");

/*
  Thin wrapper around nodemailer. If SMTP_HOST isn't configured (local dev,
  or before you've set up a provider), emails are logged to the console
  instead of thrown as errors — so registration/reset/2FA flows are still
  fully testable without real credentials. See EMAIL_SETUP.md for wiring
  up a real provider (5 minutes, free tier).
*/

let transporter = null;
let loggedDevModeNotice = false;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });

  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  const activeTransporter = getTransporter();

  if (!activeTransporter) {
    if (!loggedDevModeNotice) {
      console.warn("[mailer] SMTP_HOST not set — emails will be logged instead of sent (dev mode).");
      loggedDevModeNotice = true;
    }
    console.log(`\n[mailer] (dev mode) would send email:\n  To: ${to}\n  Subject: ${subject}\n  ${text || html}\n`);
    return { devMode: true };
  }

  return activeTransporter.sendMail({
    from: process.env.EMAIL_FROM || "Taskify <no-reply@taskify.local>",
    to,
    subject,
    html,
    text
  });
}

function wrapTemplate(title, bodyHtml) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="color:#009B72;margin-bottom:16px;">${title}</h2>
      ${bodyHtml}
      <p style="margin-top:32px;font-size:12px;color:#687280;">
        Taskify — University of Mpumalanga student marketplace.
        If you didn't expect this email, you can safely ignore it.
      </p>
    </div>`;
}

async function sendVerificationEmail(email, fullName, verifyUrl) {
  return sendMail({
    to: email,
    subject: "Verify your Taskify account",
    html: wrapTemplate("Verify your email", `
      <p>Hi ${fullName},</p>
      <p>Thanks for signing up for Taskify. Please confirm this is your email address to activate your account:</p>
      <p style="margin:24px 0;"><a href="${verifyUrl}" style="background:#009B72;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Verify my email</a></p>
      <p>Or paste this link into your browser:<br><span style="word-break:break-all;">${verifyUrl}</span></p>
      <p>This link expires in ${process.env.EMAIL_VERIFICATION_EXPIRY_HOURS || 24} hours.</p>
    `),
    text: `Hi ${fullName}, verify your Taskify account: ${verifyUrl} (expires in ${process.env.EMAIL_VERIFICATION_EXPIRY_HOURS || 24} hours)`
  });
}

async function sendPasswordResetEmail(email, fullName, resetUrl) {
  return sendMail({
    to: email,
    subject: "Reset your Taskify password",
    html: wrapTemplate("Reset your password", `
      <p>Hi ${fullName},</p>
      <p>We received a request to reset your Taskify password. Click below to choose a new one:</p>
      <p style="margin:24px 0;"><a href="${resetUrl}" style="background:#009B72;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Reset my password</a></p>
      <p>Or paste this link into your browser:<br><span style="word-break:break-all;">${resetUrl}</span></p>
      <p>This link expires in ${process.env.PASSWORD_RESET_EXPIRY_MINUTES || 30} minutes. If you didn't request this, you can ignore this email — your password won't change.</p>
    `),
    text: `Reset your Taskify password: ${resetUrl} (expires in ${process.env.PASSWORD_RESET_EXPIRY_MINUTES || 30} minutes)`
  });
}

async function sendSecurityNoticeEmail(email, fullName, message) {
  return sendMail({
    to: email,
    subject: "Taskify security notice",
    html: wrapTemplate("Security notice", `
      <p>Hi ${fullName},</p>
      <p>${message}</p>
      <p>If this wasn't you, reset your password immediately and contact an administrator.</p>
    `),
    text: `${message} If this wasn't you, reset your password immediately and contact an administrator.`
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendSecurityNoticeEmail };
