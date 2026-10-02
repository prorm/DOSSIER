import { PDFDict, PDFDocument, PDFName, PDFString, StandardFonts, rgb } from "pdf-lib";
import { utf8 } from "./bytes";

/* ─────────────────────────── RFC 5322 e-mail ─────────────────────────── */

export interface EmailSpec {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: Date;
  tz: string; // "+0530"
  messageId: string;
  /** Received chain, outermost first (as in a real message). */
  received: string[];
  headers?: Record<string, string>;
  body: string;
  attachments?: { name: string; mime: string; data: Uint8Array }[];
}

function rfc2822Date(d: Date, tz: string) {
  const sign = tz.startsWith("-") ? -1 : 1;
  const mins = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5)));
  const local = new Date(d.getTime() + mins * 60_000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${days[local.getUTCDay()]}, ${local.getUTCDate()} ${months[local.getUTCMonth()]} ${local.getUTCFullYear()} ${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())} ${tz}`;
}

export { rfc2822Date };

export function buildEmail(e: EmailSpec): Uint8Array {
  const lines: string[] = [];
  for (const r of e.received) lines.push(`Received: ${r}`);
  lines.push(`Date: ${rfc2822Date(e.date, e.tz)}`, `From: ${e.from}`, `To: ${e.to}`);
  if (e.cc) lines.push(`Cc: ${e.cc}`);
  lines.push(`Subject: ${e.subject}`, `Message-ID: <${e.messageId}>`, "MIME-Version: 1.0");
  for (const [k, v] of Object.entries(e.headers ?? {})) lines.push(`${k}: ${v}`);
  if (!e.attachments?.length) {
    lines.push("Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", e.body);
    return utf8(lines.join("\r\n") + "\r\n");
  }
  const boundary = `==dossier_${e.messageId.replace(/[^a-z0-9]/gi, "").slice(0, 16)}==`;
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "", "This is a multi-part message in MIME format.", `--${boundary}`);
  lines.push("Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", e.body);
  for (const a of e.attachments) {
    const b64 = Buffer.from(a.data).toString("base64").replace(/.{76}/g, "$&\r\n");
    lines.push(`--${boundary}`, `Content-Type: ${a.mime}; name="${a.name}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${a.name}"`, "", b64);
  }
  lines.push(`--${boundary}--`, "");
  return utf8(lines.join("\r\n"));
}

/* ─────────────────────────── PDF ─────────────────────────── */

export interface PdfSpec {
  title: string;
  author: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  created: Date;
  modified: Date;
  pages: {
    heading?: string;
    lines: string[];
    /** Text drawn and then covered by an opaque box: invisible on screen, present in the content stream. */
    redacted?: { text: string; afterLine: number }[];
    /** Text drawn in the page background colour. */
    invisible?: string[];
    footer?: string;
  }[];
  attachments?: { name: string; data: Uint8Array; mime: string; description?: string }[];
  /** Custom Info-dictionary keys (visible to exiftool / pdfinfo -meta). */
  customInfo?: Record<string, string>;
}

export async function buildPdf(spec: PdfSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(spec.title);
  doc.setAuthor(spec.author);
  if (spec.subject) doc.setSubject(spec.subject);
  if (spec.keywords) doc.setKeywords(spec.keywords);
  doc.setCreator(spec.creator ?? "LabNotebook 4.2");
  doc.setProducer(spec.producer ?? "DOSSIER synthetic evidence");
  doc.setCreationDate(spec.created);
  doc.setModificationDate(spec.modified);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  for (const p of spec.pages) {
    const page = doc.addPage([595, 842]);
    let y = 790;
    if (p.heading) {
      page.drawText(p.heading, { x: 56, y, size: 16, font: bold, color: rgb(0.1, 0.12, 0.16) });
      y -= 30;
    }
    p.lines.forEach((line, i) => {
      page.drawText(line, { x: 56, y, size: 10.5, font: line.startsWith("$") || line.startsWith(">") ? mono : font, color: rgb(0.15, 0.15, 0.18) });
      y -= 16;
      for (const r of p.redacted ?? []) {
        if (r.afterLine !== i) continue;
        page.drawText(r.text, { x: 56, y, size: 10.5, font: mono, color: rgb(0.15, 0.15, 0.18) });
        const w = mono.widthOfTextAtSize(r.text, 10.5);
        page.drawRectangle({ x: 52, y: y - 3, width: w + 8, height: 14, color: rgb(0, 0, 0) });
        y -= 16;
      }
    });
    for (const t of p.invisible ?? []) {
      page.drawText(t, { x: 56, y: 60, size: 6, font, color: rgb(1, 1, 1) });
    }
    if (p.footer) page.drawText(p.footer, { x: 56, y: 36, size: 8, font, color: rgb(0.45, 0.47, 0.5) });
  }
  for (const a of spec.attachments ?? []) {
    await doc.attach(a.data, a.name, { mimeType: a.mime, description: a.description ?? a.name, creationDate: spec.created, modificationDate: spec.modified });
  }
  if (spec.customInfo) {
    // Setting a title creates the Info dictionary; add custom keys to it.
    const infoRef = doc.context.trailerInfo.Info;
    const info = infoRef ? doc.context.lookup(infoRef, PDFDict) : undefined;
    if (info) for (const [k, v] of Object.entries(spec.customInfo)) info.set(PDFName.of(k), PDFString.of(v));
  }
  return doc.save({ useObjectStreams: false });
}
