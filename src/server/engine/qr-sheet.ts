import QRCode from "qrcode";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { checkpointUrl, type CheckpointRow } from "./live";
import type { EventRow } from "./types";

/** WinAnsi-safe text for the standard PDF fonts. */
function safe(s: string) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, max: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) {
      if (line) lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

/** One A4 page per checkpoint: large QR, name, location, instructions. */
export async function checkpointQrPdf(event: EventRow, cps: CheckpointRow[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${safe(event.name)} - checkpoint QR sheets`);
  pdf.setCreator("DOSSIER");
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  for (const cp of cps) {
    const url = checkpointUrl(cp);
    const png = await QRCode.toBuffer(url, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 900 });
    const img = await pdf.embedPng(png);
    const page = pdf.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 1.5 });
    page.drawText(safe(event.name).toUpperCase(), { x: 48, y: height - 72, size: 12, font: mono, color: rgb(0.25, 0.25, 0.25) });
    page.drawText("LIVE CHECKPOINT", { x: 48, y: height - 92, size: 10, font: mono, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(safe(cp.name), { x: 48, y: height - 132, size: 30, font: bold, maxWidth: width - 96 });
    if (cp.location) page.drawText(safe(cp.location), { x: 48, y: height - 160, size: 13, font: regular, color: rgb(0.3, 0.3, 0.3) });
    const size = 380;
    page.drawImage(img, { x: (width - size) / 2, y: height - 200 - size, width: size, height: size });
    let y = height - 200 - size - 34;
    page.drawText(`${cp.points} POINTS  ·  ${cp.requiresApproval ? "VOLUNTEER APPROVAL" : "AUTO-CONFIRM"}`.replace("·", "-"), {
      x: 48,
      y,
      size: 12,
      font: mono,
    });
    y -= 26;
    for (const line of wrap(cp.instructionsMd.replace(/[*_`#>]/g, ""), 78).slice(0, 6)) {
      page.drawText(line, { x: 48, y, size: 11, font: regular, color: rgb(0.15, 0.15, 0.15) });
      y -= 16;
    }
    page.drawText("Scan with your phone camera while signed in to your team account.", { x: 48, y: 70, size: 9, font: regular, color: rgb(0.35, 0.35, 0.35) });
    page.drawText(`ID ${cp.id}  ·  QR v${cp.tokenVersion}  ·  rotating the QR in Admin invalidates this sheet`.replace(/·/g, "-"), {
      x: 48,
      y: 52,
      size: 8,
      font: mono,
      color: rgb(0.45, 0.45, 0.45),
    });
  }
  return pdf.save();
}
