import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error(
      "Faltan las variables de entorno de correo (SMTP_HOST / SMTP_USER / SMTP_PASSWORD)."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

type Attachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Attachment[];
}) {
  const transporter = getTransporter();
  const fromName = process.env.MAIL_FROM_NAME || "Firma Fácil";
  const fromEmail = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    attachments: opts.attachments,
  });
}

export function linkEmailHtml(params: {
  recipientName: string;
  documentName: string;
  signUrl: string;
}) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
    <h2 style="margin-bottom: 8px;">Tienes un documento para firmar</h2>
    <p>Hola ${escapeHtml(params.recipientName)},</p>
    <p>Te han enviado el documento <strong>${escapeHtml(
      params.documentName
    )}</strong> para tu firma.</p>
    <p style="margin: 24px 0;">
      <a href="${params.signUrl}"
         style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">
        Ver y firmar documento
      </a>
    </p>
    <p style="font-size: 13px; color: #666;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
      <a href="${params.signUrl}">${params.signUrl}</a>
    </p>
  </div>
  `;
}

export function signedEmailHtml(params: {
  recipientName: string;
  documentName: string;
  forSigner: boolean;
}) {
  const intro = params.forSigner
    ? `Gracias, ${escapeHtml(params.recipientName)}. Adjunto encontrarás una copia del documento que acabas de firmar.`
    : `${escapeHtml(params.recipientName)} acaba de firmar el documento. Adjunto encontrarás la copia firmada.`;

  return `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
    <h2 style="margin-bottom: 8px;">Documento firmado</h2>
    <p>${intro}</p>
    <p style="font-size:13px;color:#666;">Documento: ${escapeHtml(
      params.documentName
    )}</p>
  </div>
  `;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
