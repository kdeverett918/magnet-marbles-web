import * as THREE from "three";

const badgeTextures = new Map<string, THREE.CanvasTexture>();

export function normalizeBadgeText(label: string): string {
  return label.trim().toUpperCase().replace(/[^A-Z0-9+]/g, "").slice(0, 9) || "?";
}

export function getBadgeTexture(label: string, color: string): THREE.CanvasTexture {
  const text = normalizeBadgeText(label);
  const key = `${text}:${color}`;
  const cached = badgeTextures.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create badge canvas context");

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(4, 6, 12, 0.82)";
  roundRect(ctx, 10, 10, 236, 76, 24);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  roundRect(ctx, 10, 10, 236, 76, 24);
  ctx.stroke();

  const gradient = ctx.createLinearGradient(20, 16, 236, 80);
  gradient.addColorStop(0, "rgba(255,255,255,0.32)");
  gradient.addColorStop(1, "rgba(255,255,255,0.02)");
  ctx.fillStyle = gradient;
  roundRect(ctx, 18, 18, 220, 60, 18);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${fontSizeFor(text)}px Arial, sans-serif`;
  ctx.fillText(text, 128, 50);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  badgeTextures.set(key, texture);
  return texture;
}

export function applyBadgeTexture(material: THREE.SpriteMaterial, label: string, color: string) {
  material.map = getBadgeTexture(label, color);
  material.needsUpdate = true;
}

function fontSizeFor(text: string) {
  if (text.length <= 3) return 42;
  if (text.length <= 5) return 34;
  return 27;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
