import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";

const outputs = [
  { path: "public/icons/icon-180.png", width: 180, height: 180, maskable: false },
  { path: "public/icons/icon-192.png", width: 192, height: 192, maskable: false },
  { path: "public/icons/icon-512.png", width: 512, height: 512, maskable: false },
  { path: "public/icons/icon-maskable-512.png", width: 512, height: 512, maskable: true },
  { path: "public/social-card.png", width: 1200, height: 630, maskable: false, social: true },
];

const crcTable = new Uint32Array(256);
for (let i = 0; i < crcTable.length; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c >>> 0;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBytes.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return out;
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const srcOffset = y * width * 4;
    const dstOffset = y * (width * 4 + 1);
    raw[dstOffset] = 0;
    rgba.copy(raw, dstOffset + 1, srcOffset, srcOffset + width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND"),
  ]);
}

function clamp(value, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function setPixel(buf, width, x, y, color, alpha = color[3] / 255) {
  if (x < 0 || y < 0 || x >= width || y >= buf.length / width / 4 || alpha <= 0) return;
  const index = (Math.floor(y) * width + Math.floor(x)) * 4;
  const srcA = clamp(alpha, 0, 1);
  const dstA = buf[index + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  for (let i = 0; i < 3; i++) {
    const src = color[i] / 255;
    const dst = buf[index + i] / 255;
    buf[index + i] = Math.round(((src * srcA + dst * dstA * (1 - srcA)) / outA) * 255);
  }
  buf[index + 3] = Math.round(outA * 255);
}

function fillBackground(buf, width, height, options) {
  const social = Boolean(options.social);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const dx = nx - (social ? 0.62 : 0.48);
      const dy = ny - 0.42;
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.7);
      const rim = Math.max(0, 1 - Math.abs(Math.sqrt((nx - 0.5) ** 2 + (ny - 0.52) ** 2) - 0.36) * 18);
      const stripe = Math.max(0, Math.sin((nx + ny) * 20) * 0.5 + 0.5) * 0.08;
      const r = 9 + glow * 28 + rim * 14 + stripe * 20;
      const g = 12 + glow * 33 + rim * 22 + stripe * 14;
      const b = 22 + glow * 50 + rim * 40 + stripe * 24;
      setPixel(buf, width, x, y, [r, g, b, 255], 1);
    }
  }
}

function drawCircle(buf, width, height, cx, cy, radius, color, softness = 1.5) {
  const minX = Math.max(0, Math.floor(cx - radius - softness - 1));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius + softness + 1));
  const minY = Math.max(0, Math.floor(cy - radius - softness - 1));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius + softness + 1));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const alpha = clamp((radius + softness - d) / Math.max(0.001, softness), 0, 1) * (color[3] / 255);
      setPixel(buf, width, x, y, color, alpha);
    }
  }
}

function drawSphere(buf, width, height, cx, cy, radius, base, accent) {
  drawCircle(buf, width, height, cx + radius * 0.08, cy + radius * 0.12, radius * 1.08, [0, 0, 0, 70], 4);
  const minX = Math.max(0, Math.floor(cx - radius - 2));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius + 2));
  const minY = Math.max(0, Math.floor(cy - radius - 2));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius + 2));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const rx = (x + 0.5 - cx) / radius;
      const ry = (y + 0.5 - cy) / radius;
      const d = Math.hypot(rx, ry);
      if (d > 1.02) continue;
      const edge = clamp((1.02 - d) / 0.05, 0, 1);
      const light = clamp(1.18 - Math.hypot(rx + 0.38, ry + 0.48), 0, 1);
      const shade = clamp(1 - d * 0.55, 0.25, 1);
      const stripe = clamp(1 - Math.abs(rx * 0.95 + ry * 0.18) * 5, 0, 1);
      const color = [0, 1, 2].map((i) => clamp(mix(base[i] * shade, accent[i], stripe * 0.65) + light * 90));
      setPixel(buf, width, x, y, [...color, 255], edge);
    }
  }
  drawCircle(buf, width, height, cx - radius * 0.34, cy - radius * 0.38, radius * 0.22, [255, 255, 255, 125], 3);
}

function drawLine(buf, width, height, x1, y1, x2, y2, color, thickness) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / Math.max(1, thickness * 0.45)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    drawCircle(buf, width, height, mix(x1, x2, t), mix(y1, y2, t), thickness, color, thickness);
  }
}

function drawArc(buf, width, height, cx, cy, radius, start, end, color, thickness) {
  const steps = Math.max(12, Math.ceil(Math.abs(end - start) * radius / Math.max(1, thickness)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = mix(start, end, t);
    drawCircle(buf, width, height, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, thickness, color, thickness);
  }
}

function render(width, height, options = {}) {
  const buf = Buffer.alloc(width * height * 4);
  fillBackground(buf, width, height, options);

  const scale = Math.min(width, height);
  const cx = options.social ? width * 0.64 : width * 0.5;
  const cy = height * (options.social ? 0.5 : 0.51);
  const safe = options.maskable ? 0.84 : 1;
  const radius = scale * (options.social ? 0.18 : 0.23) * safe;

  drawCircle(buf, width, height, cx, cy, scale * 0.39 * safe, [7, 10, 18, 170], 8);
  drawCircle(buf, width, height, cx, cy, scale * 0.36 * safe, [22, 28, 43, 210], 6);
  drawArc(buf, width, height, cx, cy, scale * 0.34 * safe, Math.PI * 0.1, Math.PI * 0.9, [87, 238, 255, 155], scale * 0.012);
  drawArc(buf, width, height, cx, cy, scale * 0.31 * safe, Math.PI * 1.1, Math.PI * 1.85, [255, 91, 140, 145], scale * 0.012);

  const small = [
    [-0.35, -0.26, [255, 198, 66], [255, 255, 185]],
    [0.34, -0.22, [82, 236, 169], [205, 255, 231]],
    [-0.3, 0.31, [255, 92, 134], [255, 207, 222]],
    [0.35, 0.28, [130, 169, 255], [231, 238, 255]],
  ];
  for (const [ox, oy, base, accent] of small) {
    const sx = cx + ox * scale * safe;
    const sy = cy + oy * scale * safe;
    drawLine(buf, width, height, cx, cy, sx, sy, [111, 238, 255, 55], scale * 0.006);
    drawSphere(buf, width, height, sx, sy, scale * 0.055 * safe, base, accent);
  }

  drawSphere(buf, width, height, cx, cy, radius, [54, 107, 255], [255, 89, 147]);
  drawArc(buf, width, height, cx, cy, radius * 1.42, Math.PI * 1.28, Math.PI * 1.72, [255, 255, 255, 155], scale * 0.01);

  if (options.social) {
    drawCircle(buf, width, height, width * 0.2, height * 0.47, height * 0.26, [17, 22, 34, 190], 10);
    drawArc(buf, width, height, width * 0.2, height * 0.47, height * 0.24, Math.PI * 0.05, Math.PI * 1.95, [255, 205, 75, 120], height * 0.012);
    drawSphere(buf, width, height, width * 0.2, height * 0.47, height * 0.13, [70, 213, 160], [255, 240, 162]);
    drawLine(buf, width, height, width * 0.2, height * 0.47, cx - radius * 0.4, cy, [111, 238, 255, 75], height * 0.01);
  }

  return buf;
}

for (const output of outputs) {
  const pixels = render(output.width, output.height, output);
  await mkdir(dirname(output.path), { recursive: true });
  await writeFile(output.path, encodePng(output.width, output.height, pixels));
  console.log(`wrote ${output.path}`);
}
