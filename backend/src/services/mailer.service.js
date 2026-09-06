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
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    /*
      Nodemailer's defaults here are generous enough to feel like a hang to
      a real user — up to 2 minutes just to connect, up to 10 minutes on
      the socket overall — with nothing surfaced to the frontend in the
      meantime. A misconfigured host/port (wrong value, blocked outbound
      port, secure/port mismatch) should fail loud and fast instead, so
      the caller's try/catch actually gets a chance to run.
    */
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
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

/* OTP-based, not a clickable link — same "short code to type back in"
   pattern as sendLoginOtpEmail, reused here for the registration step. */
async function sendVerificationEmail(email, fullName, code) {
  const expiryMinutes = process.env.EMAIL_VERIFICATION_OTP_EXPIRY_MINUTES || 15;
  return sendMail({
    to: email,
    subject: `Your Taskify verification code: ${code}`,
    html: wrapTemplate("Verify your email", `
      <p>Hi ${fullName},</p>
      <p>Thanks for signing up for Taskify. Enter this code to confirm your email and activate your account:</p>
      <p style="margin:24px 0;font-size:32px;font-weight:800;letter-spacing:4px;color:#009B72;">${code}</p>
      <p>This code expires in ${expiryMinutes} minutes.</p>
    `),
    text: `Your Taskify verification code is ${code}. It expires in ${expiryMinutes} minutes.`
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

/* Login-time 2FA fallback for someone without their authenticator app or
   backup codes on hand — see auth.service.js's requestLoginEmailOtp. Kept
   visually distinct from sendVerificationEmail/sendPasswordResetEmail
   (no clickable button — the whole point is a short code to type back
   into the two-factor screen) and mirrors sendPasswordResetEmail's
   expiry-minutes wording. */
async function sendLoginOtpEmail(email, fullName, code) {
  const expiryMinutes = process.env.LOGIN_EMAIL_OTP_EXPIRY_MINUTES || 10;
  return sendMail({
    to: email,
    subject: `Your Taskify sign-in code: ${code}`,
    html: wrapTemplate("Your sign-in code", `
      <p>Hi ${fullName},</p>
      <p>Use this code to finish signing in to Taskify:</p>
      <p style="margin:24px 0;font-size:32px;font-weight:800;letter-spacing:4px;color:#009B72;">${code}</p>
      <p>This code expires in ${expiryMinutes} minutes. If you didn't just try to sign in, you can ignore this email — your account is safe.</p>
    `),
    text: `Your Taskify sign-in code is ${code}. It expires in ${expiryMinutes} minutes. If you didn't try to sign in, ignore this email.`
  });
}

/* Confirms an account controls its own email before turning on email-based
   2FA (the "prove it" step, same role the QR-code scan + app code plays
   for the authenticator method) — see auth.service.js's
   requestEmailTwoFactorSetupCode / enableEmailTwoFactor. Distinct copy
   from sendLoginOtpEmail so someone doesn't mistake a setup email for a
   login attempt they didn't make. */
async function sendTwoFactorSetupOtpEmail(email, fullName, code) {
  const expiryMinutes = process.env.LOGIN_EMAIL_OTP_EXPIRY_MINUTES || 10;
  return sendMail({
    to: email,
    subject: `Your Taskify two-factor setup code: ${code}`,
    html: wrapTemplate("Confirm two-factor setup", `
      <p>Hi ${fullName},</p>
      <p>Use this code to finish turning on email-based two-factor authentication for your Taskify account:</p>
      <p style="margin:24px 0;font-size:32px;font-weight:800;letter-spacing:4px;color:#009B72;">${code}</p>
      <p>This code expires in ${expiryMinutes} minutes. If you didn't request this, you can ignore this email — nothing changes on your account.</p>
    `),
    text: `Your Taskify two-factor setup code is ${code}. It expires in ${expiryMinutes} minutes. If you didn't request this, ignore this email.`
  });
}

/* Generic wrapper for the short list of high-value in-app notifications
   that also get emailed (see notification.service.js's `email: true`
   opt-in) — content flagged for review, new reports, listings removed,
   account suspended/banned, task accepted, payment released. Reuses the
   same title/message text already written for the in-app notification
   rather than a separate copy of wording to maintain. */
async function sendNotificationEmail(email, fullName, title, message, actionUrl = null) {
  return sendMail({
    to: email,
    subject: `Taskify: ${title}`,
    html: wrapTemplate(title, `
      <p>Hi ${fullName},</p>
      <p>${message}</p>
      ${actionUrl ? `<p style="margin:24px 0;"><a href="${actionUrl}" style="background:#009B72;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">View in Taskify</a></p>` : ""}
    `),
    text: `${message}${actionUrl ? `\n\nView in Taskify: ${actionUrl}` : ""}`
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendSecurityNoticeEmail,
  sendLoginOtpEmail,
  sendTwoFactorSetupOtpEmail,
  sendNotificationEmail
};
