import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type OutgoingEmail = { to: string[]; subject: string; html: string; replyTo?: string };

/** The default team inbox for request notifications (override with NOTIFY_EMAILS). */
const DEFAULT_TEAM_EMAILS = ["geoff@pgamemes.com", "travis@pgamemes.com"];

export function teamNotificationEmails() {
  const configured = (process.env.NOTIFY_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_TEAM_EMAILS;
}

function fromAddress() {
  return process.env.EMAIL_FROM || "Five9 Media <notifications@five9.media>";
}

let transport: Transporter | null = null;

function smtpTransport() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transport;
}

/**
 * Sends through Resend (RESEND_API_KEY) or any SMTP server (SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASSWORD). With neither configured, emails are skipped and logged.
 */
export async function sendEmail(email: OutgoingEmail) {
  const to = [...new Set(email.to.map((address) => address.trim().toLowerCase()).filter(Boolean))];
  if (!to.length) return;

  if (process.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to, subject: email.subject, html: email.html, reply_to: email.replyTo }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Resend rejected the email (${response.status})`);
    return;
  }

  const smtp = smtpTransport();
  if (smtp) {
    await smtp.sendMail({ from: fromAddress(), to, subject: email.subject, html: email.html, replyTo: email.replyTo });
    return;
  }

  console.info("[email] No email provider configured; skipped:", email.subject);
}
