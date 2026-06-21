import * as THREE from "three";

// Cheap hash-based value noise → fractal marble/slate texture, generated once
// on a canvas. Gives the cracked-marble look from the board references without
// shipping any image assets.
function hash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tl = hash(xi, yi);
  const tr = hash(xi + 1, yi);
  const bl = hash(xi, yi + 1);
  const br = hash(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(tl, tr, u), THREE.MathUtils.lerp(bl, br, u), v);
}

function fbm(x: number, y: number, oct: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Vibrant vertical gradient backdrop (arcade sky) used as scene.background. */
export function makeGradientTexture(stops: [number, string][]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [pos, col] of stops) grad.addColorStop(pos, col);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let cached: { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } | null = null;

/** Slate/marble albedo + roughness maps for the arena surface. */
export function getStoneTextures(): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  if (cached) return cached;
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const rc = document.createElement("canvas");
  rc.width = rc.height = size;
  const rctx = rc.getContext("2d")!;
  const rimg = rctx.createImageData(size, size);
  const rd = rimg.data;

  const scale = 5.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x / size) * scale;
      const ny = (y / size) * scale;
      const base = fbm(nx, ny, 5);
      // domain-warped ridged veins (marble cracks)
      const warp = fbm(nx + 5.2, ny + 1.3, 3);
      const vein = Math.abs(Math.sin((nx + warp * 2.4) * 3.1 + base * 4.0));
      const crack = Math.pow(1 - vein, 14); // thin bright veins

      // slate tones: #20242d -> #3a4150
      const t = base * 0.7 + 0.15;
      let r = THREE.MathUtils.lerp(0x20, 0x3a, t);
      let g = THREE.MathUtils.lerp(0x24, 0x41, t);
      let b = THREE.MathUtils.lerp(0x2d, 0x50, t);
      // veins lean cool-grey/gold
      r += crack * 70;
      g += crack * 66;
      b += crack * 58;

      const i = (y * size + x) * 4;
      d[i] = Math.min(255, r);
      d[i + 1] = Math.min(255, g);
      d[i + 2] = Math.min(255, b);
      d[i + 3] = 255;

      // roughness: veins polished (darker = smoother), body rougher
      const rough = Math.min(255, 200 - crack * 150 - base * 40);
      rd[i] = rd[i + 1] = rd[i + 2] = rough;
      rd[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const rough = new THREE.CanvasTexture(rc);
  cached = { map, rough };
  return cached;
}
