import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env"
    );
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: { user, pass },
  });
  return transporter;
}

/*
 * Send an EPUB to a Kindle address. Amazon uses the attachment as the document;
 * the subject/body are ignored for delivery but a subject helps the user.
 */
export async function sendEpubToKindle({ kindleEmail, filename, title, epubBuffer }) {
  const from = process.env.SENDER_EMAIL || process.env.SMTP_USER;
  const t = getTransporter();
  const info = await t.sendMail({
    from,
    to: kindleEmail,
    subject: title || "Document",
    text: "Sent by Article to Kindle.",
    attachments: [
      {
        filename: filename || "article.epub",
        content: epubBuffer,
        contentType: "application/epub+zip",
      },
    ],
  });
  return { messageId: info.messageId, from, accepted: info.accepted, rejected: info.rejected };
}

export async function verifySmtp() {
  const t = getTransporter();
  await t.verify();
  return true;
}
