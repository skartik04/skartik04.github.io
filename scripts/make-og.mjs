// Generates the paper-style OG card(s) as PNG using sharp (SVG -> PNG).
// Run: node scripts/make-og.mjs   (re-run when a post title changes)
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;");

// One card per entry. Keep title to <= ~30 chars/line; wrap manually.
const cards = [
  {
    file: "does-a-privileged-teacher-teach",
    titleLines: ["Auditing the Teaching Signal", "in On-Policy Self-Distillation"],
    tagline: "What a privileged teacher actually transfers, token by token.",
    author: "Kartik Sharma",
  },
];

const W = 1200,
  H = 630;

function svg(c) {
  const titleSpans = c.titleLines
    .map((line, i) => `<tspan x="96" dy="${i === 0 ? 0 : 78}">${esc(line)}</tspan>`)
    .join("");
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#fbfbf9"/>
  <rect width="16" height="${H}" fill="#b5432b"/>
  <rect x="${W - 1}" width="1" height="${H}" fill="#e6e3dd"/>
  <text y="278" font-family="DejaVu Sans, sans-serif" font-size="62" font-weight="bold" fill="#1a1a1a">${titleSpans}</text>
  <text x="96" y="438" font-family="DejaVu Sans, sans-serif" font-size="30" fill="#555">${esc(
    c.tagline
  )}</text>
</svg>`;
}

await mkdir("public/og", { recursive: true });
for (const c of cards) {
  const out = `public/og/${c.file}.png`;
  await sharp(Buffer.from(svg(c))).png().toFile(out);
  console.log("wrote", out);
}
