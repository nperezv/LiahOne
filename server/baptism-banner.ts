import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function generateBaptismBannerPng(options: {
  candidateName: string;
  serviceDate: Date;
  wardName: string | null;
  posts: { displayName: string; message: string }[];
}): Promise<Buffer> {
  const W = 1200, H = 800;

  const shepherdPath = path.join(process.cwd(), "client", "public", "theshepherd.png");
  const shepherdB64 = fs.readFileSync(shepherdPath).toString("base64");

  const rawText =
    options.posts.length > 0
      ? options.posts.map((p) => (p.displayName ? `${p.displayName}: ${p.message}` : p.message)).join("  ·  ")
      : "Con amor y gratitud  ·  ";

  const repeated = Array(40).fill(rawText).join("  ·  ");
  const lines: string[] = [];
  let rem = repeated;
  while (lines.length < 32 && rem.length > 0) {
    lines.push(rem.slice(0, 98));
    rem = rem.slice(92);
  }

  const dateStr = options.serviceDate.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });
  const ward = options.wardName?.trim() || "Barrio";

  const bgLines = lines
    .map(
      (line, i) =>
        `<text x="20" y="${32 + i * 24}" font-size="12" fill="rgba(255,255,255,0.09)" font-family="Georgia,serif">${escapeXml(line)}</text>`
    )
    .join("\n");

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0B1120"/>
      <stop offset="100%" stop-color="#060A14"/>
    </linearGradient>
    <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#060A14" stop-opacity="0"/>
      <stop offset="55%" stop-color="#060A14" stop-opacity="0.88"/>
      <stop offset="100%" stop-color="#060A14" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${bgLines}
  <image href="data:image/png;base64,${shepherdB64}" x="300" y="30" width="600" height="620" opacity="0.28" preserveAspectRatio="xMidYMid meet"/>
  <rect x="0" y="420" width="${W}" height="380" fill="url(#bottomFade)"/>
  <text x="${W / 2}" y="52" font-size="14" fill="rgba(232,199,122,0.45)" font-family="Georgia,serif" font-style="italic" text-anchor="middle">&#x201C;He aqu&#xED; el agua, &#xBF;qu&#xE9; impide que yo sea bautizado?&#x201D; &#x2014; Hechos 8:36</text>
  <text x="${W / 2}" y="696" font-size="66" fill="#E8C77A" font-family="Georgia,serif" font-weight="bold" text-anchor="middle" letter-spacing="2">${escapeXml(options.candidateName)}</text>
  <text x="${W / 2}" y="744" font-size="19" fill="rgba(255,255,255,0.52)" font-family="Georgia,serif" text-anchor="middle">${escapeXml(dateStr)}</text>
  <text x="${W / 2}" y="775" font-size="15" fill="rgba(232,199,122,0.48)" font-family="Georgia,serif" text-anchor="middle">${escapeXml(ward)}</text>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}
