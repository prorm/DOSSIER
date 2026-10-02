// Generates the small sample exhibits used by the Room lab (/dev/rooms).
// Run once: node scripts/make-dev-assets.mjs   (output is committed under public/dev/)
import fs from "node:fs";
import path from "node:path";

const out = path.resolve("public/dev");
fs.mkdirSync(out, { recursive: true });

// ── stereo WAV: Morse-ish beeps on the left, a slow sweep on the right ──
{
  const rate = 22050;
  const seconds = 4.2;
  const n = Math.floor(rate * seconds);
  const data = Buffer.alloc(n * 4);
  const morse = [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1];
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const slot = Math.floor(t / 0.13) % morse.length;
    const l = morse[slot] ? Math.sin(2 * Math.PI * 720 * t) * 0.6 * (0.9 + 0.1 * Math.sin(t * 40)) : 0;
    const r = Math.sin(2 * Math.PI * (300 + 900 * (t / seconds)) * t) * 0.35 * Math.min(1, t * 3) * (0.6 + 0.4 * Math.sin(t * 2.4));
    data.writeInt16LE(Math.round(l * 30000), i * 4);
    data.writeInt16LE(Math.round(r * 30000), i * 4 + 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(2, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 4, 28);
  head.writeUInt16LE(4, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(out, "sample-recording.wav"), Buffer.concat([head, data]));
}

// ── pcap: 60 s of quiet chatter with a beacon every 4 s and a burst around 40 s ──
{
  const pk = [];
  let t = 1_700_000_000;
  const push = (dt, len) => {
    t += dt;
    const b = Buffer.alloc(16 + len);
    b.writeUInt32LE(Math.floor(t), 0);
    b.writeUInt32LE(Math.round((t % 1) * 1e6), 4);
    b.writeUInt32LE(len, 8);
    b.writeUInt32LE(len, 12);
    for (let i = 0; i < len; i++) b[16 + i] = (i * 7 + len) & 255;
    pk.push(b);
  };
  for (let s = 0; s < 60; s++) {
    if (s % 4 === 0) push(0.02, 74);
    push(0.31, 60 + ((s * 13) % 40));
    if (s > 38 && s < 44) for (let k = 0; k < 18; k++) push(0.02, 300 + ((k * 37) % 900));
    push(0.6, 64);
  }
  const head = Buffer.alloc(24);
  head.writeUInt32LE(0xa1b2c3d4, 0);
  head.writeUInt16LE(2, 4);
  head.writeUInt16LE(4, 6);
  head.writeUInt32LE(65535, 16);
  head.writeUInt32LE(1, 20);
  fs.writeFileSync(path.join(out, "sample-capture.pcap"), Buffer.concat([head, ...pk]));
}

// ── a whiteboard photograph (SVG stands in for a JPEG) ──
fs.writeFileSync(
  path.join(out, "sample-photo.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" width="640" height="420">
  <defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e9edf0"/><stop offset="1" stop-color="#c9d1d6"/></linearGradient>
  <filter id="n"><feTurbulence baseFrequency=".8" numOctaves="2"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .07 0"/></filter></defs>
  <rect width="640" height="420" fill="#3b3f44"/>
  <rect x="34" y="28" width="572" height="330" rx="6" fill="url(#w)" stroke="#8a9096" stroke-width="6"/>
  <g fill="none" stroke="#1d3d7a" stroke-width="3" stroke-linecap="round">
    <path d="M70 90 h200 M70 130 h150 M70 170 h230"/>
    <circle cx="430" cy="130" r="46"/><path d="M430 84 v-30 M476 130 h30 M430 176 v30 M384 130 h-30"/>
  </g>
  <g fill="#b3261e" font-family="monospace" font-size="22"><text x="70" y="250">B-114 ▸ 02:47</text><text x="70" y="290" font-size="16">do NOT erase</text></g>
  <rect x="34" y="28" width="572" height="330" filter="url(#n)"/>
  <rect x="200" y="368" width="240" height="26" rx="3" fill="#2a2d31"/>
  <rect x="34" y="28" width="572" height="330" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="12"/>
</svg>`,
);

console.log("wrote", fs.readdirSync(out).join(", "));
