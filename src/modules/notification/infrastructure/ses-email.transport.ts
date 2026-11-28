import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";

export interface SesAttachment {
  filename: string;
  path?: string;
  content?: string;
}

export interface SesEmail {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: SesAttachment[];
}

const region = process.env.AWS_SES_REGION || "ap-south-1";
const client = new SESv2Client({ region });

const cleanHeader = (value: string): string => value.replace(/[\r\n]+/g, " ").trim();
const encodeHeader = (value: string): string =>
  /^[\x00-\x7F]*$/.test(value)
    ? cleanHeader(value)
    : `=?UTF-8?B?${Buffer.from(cleanHeader(value), "utf8").toString("base64")}?=`;

const encodeMimeBody = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64").replace(/.{1,76}/g, "$&\r\n").replace(/\r\n$/, "");

const htmlToText = (html: string): string =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|tr|li)>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();

async function buildRawMessage(email: SesEmail, from: string, recipients: string[]): Promise<Buffer> {
  const mixedBoundary = `mixed-${randomUUID()}`;
  const alternativeBoundary = `alternative-${randomUUID()}`;
  const lines: string[] = [
    `From: ${cleanHeader(from)}`,
    `To: ${recipients.map(cleanHeader).join(", ")}`,
    `Subject: ${encodeHeader(email.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeMimeBody(email.text || htmlToText(email.html)),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodeMimeBody(email.html),
    `--${alternativeBoundary}--`,
    "",
  ];

  for (const attachment of email.attachments || []) {
    const bytes = attachment.path
      ? await readFile(attachment.path)
      : Buffer.from(attachment.content || "", "utf8");
    const filename = cleanHeader(attachment.filename).replace(/["\\]/g, "_");
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: application/octet-stream; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      bytes.toString("base64").replace(/.{1,76}/g, "$&\r\n"),
      "",
    );
  }

  lines.push(`--${mixedBoundary}--`, "");
  return Buffer.from(lines.join("\r\n"), "utf8");
}

/**
 * Shared SES transport for every application email.
 * Credentials use the AWS default provider chain (EC2 IAM role in production).
 */
export async function sendSesEmail(email: SesEmail): Promise<string | undefined> {
  const from = email.from || process.env.SES_FROM_EMAIL || "notifications@kankanasilks.com";
  const recipients = Array.isArray(email.to) ? email.to : [email.to];
  if (!recipients.length || recipients.some((recipient) => !recipient.trim())) {
    throw new Error("At least one valid email recipient is required");
  }

  const provider = (process.env.EMAIL_PROVIDER || (process.env.APP_ENV === "qa" ? "nodemailer" : "ses")).toLowerCase();
  if (provider === "nodemailer" || provider === "smtp") {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) throw new Error("SMTP_HOST, SMTP_USER and SMTP_PASS are required when EMAIL_PROVIDER=nodemailer");
    const transporter = nodemailer.createTransport({
      host, port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: { user, pass },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    });
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL || from,
      to: recipients,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text || htmlToText(email.html),
      html: email.html,
      attachments: (email.attachments || []).map((attachment) => ({
        filename: attachment.filename,
        ...(attachment.path ? { path: attachment.path } : { content: attachment.content || "" }),
      })),
    });
    return result.messageId;
  }
  if (provider !== "ses") throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
  const configurationSet = process.env.SES_CONFIGURATION_SET;
  const common = {
    FromEmailAddress: from,
    Destination: { ToAddresses: recipients },
    ...(email.replyTo ? { ReplyToAddresses: [email.replyTo] } : {}),
    ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
  };

  const content = email.attachments?.length
    ? { Raw: { Data: await buildRawMessage(email, from, recipients) } }
    : {
        Simple: {
          Subject: { Data: email.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: email.html, Charset: "UTF-8" },
            Text: { Data: email.text || htmlToText(email.html), Charset: "UTF-8" },
          },
        },
      };

  const result = await client.send(new SendEmailCommand({ ...common, Content: content }));
  return result.MessageId;
}
