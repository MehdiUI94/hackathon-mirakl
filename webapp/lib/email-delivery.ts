import nodemailer from "nodemailer";

type SenderSettings = {
  defaultSenderEmail?: string | null;
  defaultSenderName?: string | null;
};

type DraftEmail = {
  toEmail: string;
  toFirstName?: string | null;
  subject: string;
  bodyText: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

export function canSendDirectEmail() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      (process.env.SMTP_FROM_EMAIL || process.env.DEFAULT_SENDER_EMAIL)
  );
}

export async function sendDraftEmailDirect(
  draft: DraftEmail,
  settings?: SenderSettings | null
) {
  const transporter = getTransporter();
  const sender = getSenderIdentity(settings);

  return transporter.sendMail({
    from: sender.formatted,
    to: formatRecipient(draft.toEmail, draft.toFirstName),
    subject: draft.subject,
    text: draft.bodyText,
    html: renderSimpleHtml(draft.bodyText),
  });
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const port = Number(process.env.SMTP_PORT ?? 587);
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: parseBoolean(process.env.SMTP_SECURE, port === 465),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return cachedTransporter;
}

function getSenderIdentity(settings?: SenderSettings | null) {
  const email =
    process.env.SMTP_FROM_EMAIL ??
    settings?.defaultSenderEmail ??
    process.env.DEFAULT_SENDER_EMAIL ??
    process.env.SMTP_USER ??
    "";
  const name =
    process.env.SMTP_FROM_NAME ??
    settings?.defaultSenderName ??
    process.env.DEFAULT_SENDER_NAME ??
    "";

  return {
    email,
    name,
    formatted: formatRecipient(email, name),
  };
}

function formatRecipient(email: string, displayName?: string | null) {
  const trimmedEmail = email.trim();
  const trimmedName = displayName?.trim();
  return trimmedName ? `"${escapeQuotes(trimmedName)}" <${trimmedEmail}>` : trimmedEmail;
}

function renderSimpleHtml(bodyText: string) {
  const escaped = escapeHtml(bodyText).replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">${escaped}</div>`;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeQuotes(value: string) {
  return value.replaceAll('"', '\\"');
}
