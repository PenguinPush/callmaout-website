// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
export const TRANSITIONS = ["cube", "shatter", "bounce-3d", "crane"] as const;
export type Transition = typeof TRANSITIONS[number];
export const PHOTO_HOLD_MS = 2000;
export const END_HOLD_MS = 250;
export const TRANSITION_SPECS: Record<Transition, { frames: number; delay: number }> = {
  cube: { frames: 9, delay: 80 },
  shatter: { frames: 9, delay: 80 },
  "bounce-3d": { frames: 16, delay: 70 },
  crane: { frames: 23, delay: 70 },
};
// Select without replacement: each ordered pair is equally likely.
export function chooseTransitions(random = Math.random): { entrance: Transition; effect: Transition } {
  const incoming = Math.floor(random() * TRANSITIONS.length);
  const outgoing = Math.floor(random() * (TRANSITIONS.length - 1));
  return { entrance: TRANSITIONS[incoming], effect: TRANSITIONS[outgoing >= incoming ? outgoing + 1 : outgoing] };
}

export function animationDuration(entrance: Transition, effect: Transition) {
  return TRANSITION_SPECS[entrance].frames * TRANSITION_SPECS[entrance].delay + PHOTO_HOLD_MS +
    (TRANSITION_SPECS[effect].frames - 1) * TRANSITION_SPECS[effect].delay + END_HOLD_MS;
}

// Reserve one palette slot for transparency; visible geometry samples the photo.
export const EFFECT_COLORS = [[0, 0, 0]];

type Point = [number, number];
type Triangle = [Point, Point, Point];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

// Rasterize a textured triangle into a reusable destination->source lookup.
function triangle(map: Int32Array, width: number, height: number, source: Triangle, target: Triangle) {
  const [a, b, c] = target;
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(denominator) < 0.01) return;
  const left = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const right = Math.min(width, Math.ceil(Math.max(a[0], b[0], c[0])));
  const top = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const bottom = Math.min(height, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const u = ((b[1] - c[1]) * (x + 0.5 - c[0]) + (c[0] - b[0]) * (y + 0.5 - c[1])) / denominator;
    const v = ((c[1] - a[1]) * (x + 0.5 - c[0]) + (a[0] - c[0]) * (y + 0.5 - c[1])) / denominator;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    const sx = Math.max(0, Math.min(width - 1, Math.floor(u * source[0][0] + v * source[1][0] + w * source[2][0])));
    const sy = Math.max(0, Math.min(height - 1, Math.floor(u * source[0][1] + v * source[1][1] + w * source[2][1])));
    map[y * width + x] = sy * width + sx;
  }
}

function bounce3d(map: Int32Array, width: number, height: number, t: number) {
  // Two depth pulses: shrink away, jump forward, recede, then leap out of frame.
  const keys = [[0, 1], [0.22, 0.48], [0.44, 1.2], [0.63, 0.58], [0.8, 1.05], [1, 0.15]];
  let index = 0;
  while (index < keys.length - 2 && t > keys[index + 1][0]) index++;
  const local = ease((t - keys[index][0]) / (keys[index + 1][0] - keys[index][0]));
  const scale = mix(keys[index][1], keys[index + 1][1], local);
  const angle = Math.sin(t * Math.PI * 4) * 0.48;
  const roll = Math.sin(t * Math.PI * 2) * 0.10;
  const lift = -Math.abs(Math.sin(t * Math.PI * 2)) * height * 0.13 - Math.max(0, (t - 0.8) / 0.2) * height;
  const project = (u: number, v: number, offset = 0): Point => {
    const depth = 1 + Math.sin(angle) * u * 0.3;
    const px = Math.cos(angle) * u * width * scale / (2 * depth);
    const py = v * height * scale / (2 * depth);
    return [width / 2 + Math.cos(roll) * px - Math.sin(roll) * py + offset, height / 2 + lift + Math.sin(roll) * px + Math.cos(roll) * py + offset];
  };
  const corners: Point[] = [project(-1, -1), project(1, -1), project(1, 1), project(-1, 1)];
  const source: Point[] = [[0, 0], [width, 0], [width, height], [0, height]];
  triangle(map, width, height, [source[0], source[1], source[2]], [corners[0], corners[1], corners[2]]);
  triangle(map, width, height, [source[0], source[2], source[3]], [corners[0], corners[2], corners[3]]);
}

const CRANE_PARTS: Triangle[] = [
  [[-0.18, 0.12], [0.18, 0.15], [0.02, -0.07]], // upper body
  [[-0.18, 0.12], [0.18, 0.15], [0.02, 0.25]], // lower body
  [[-0.12, 0.12], [0.02, -0.07], [-0.32, -0.47]], // near wing
  [[0.02, -0.07], [0.18, 0.15], [0.25, -0.44]], // far wing
  [[-0.18, 0.12], [-0.03, 0.22], [-0.55, -0.02]], // tail
  [[0.12, 0.13], [0.21, 0.13], [0.32, -0.25]], // folded neck
  [[0.21, 0.13], [0.32, -0.25], [0.37, -0.23]],
  [[0.32, -0.25], [0.44, -0.24], [0.43, -0.32]], // head
  [[0.44, -0.24], [0.43, -0.32], [0.60, -0.18]], // beak
];

function crane(map: Int32Array, width: number, height: number, t: number) {
  const fold = ease(Math.min(1, t / 0.5));
  const flight = ease(Math.max(0, (t - 0.58) / 0.42));
  const size = Math.min(width * 0.70, height * 0.85) * (1 - flight * 0.6);
  const perimeter = (position: number): Point => {
    const side = position * 4;
    if (side < 1) return [side * width, 0];
    if (side < 2) return [width, (side - 1) * height];
    if (side < 3) return [(3 - side) * width, height];
    return [0, (4 - side) * height];
  };
  const flightAngle = -flight * 0.35;
  CRANE_PARTS.forEach((part, i) => {
    const source: Triangle = [[width / 2, height / 2], perimeter(i / CRANE_PARTS.length), perimeter((i + 1) / CRANE_PARTS.length)];
    const target = part.map(([x, y], vertex): Point => {
      // Wing tips flap after the fold; the body, neck, and beak stay rigid.
      const flap = (i === 2 || i === 3) && vertex === 2 && t > 0.5 ? Math.sin((t - 0.5) * Math.PI * 8) * 0.25 : 0;
      const px = x * size, py = (y + flap) * size;
      const tx = width / 2 + Math.cos(flightAngle) * px - Math.sin(flightAngle) * py + flight * width * 0.9;
      const ty = height / 2 + Math.sin(flightAngle) * px + Math.cos(flightAngle) * py - flight * height * 0.85;
      return [mix(source[vertex][0], tx, fold), mix(source[vertex][1], ty, fold)];
    }) as Triangle;
    triangle(map, width, height, source, target);
  });
}

// Destination pixel -> source pixel or negative effect color. Independent of photo content.
export function transitionMaps(width: number, height: number, effect: Transition): Int32Array[] {
  const frames = TRANSITION_SPECS[effect].frames;
  const maps = Array.from({ length: frames }, () => new Int32Array(width * height).fill(-1));
  for (let frame = 0; frame < maps.length - 1; frame++) {
    const t = (frame + 1) / frames;
    const progress = t * t * (3 - 2 * t);
    const map = maps[frame];
    if (effect === "cube") {
      // Inverse perspective projection of the textured front face of a turning cube.
      // The incoming side is transparent, matching the background.
      const angle = progress * Math.PI / 2;
      const c = Math.cos(angle), s = Math.sin(angle);
      for (let y = 0; y < height; y++) {
        const v = (2 * (y + 0.5) / height - 1) / 3;
        for (let x = 0; x < width; x++) {
          const u = (2 * (x + 0.5) / width - 1) / 3;
          const denominator = c - u * s;
          if (denominator <= 0) continue;
          const sx = (u * (4 - c) - s) / denominator;
          const sy = v * (4 + s * sx - c);
          if (sx >= -1 && sx < 1 && sy >= -1 && sy < 1) {
            map[y * width + x] = Math.floor((sy + 1) * height / 2) * width + Math.floor((sx + 1) * width / 2);
          }
        }
      }
    } else if (effect === "shatter") {
      // 48 triangular shards. Their trajectories and rasterization are cached once.
      const cols = 6, rows = 4;
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) for (let half = 0; half < 2; half++) {
        const id = (row * cols + col) * 2 + half;
        const left = col * width / cols, top = row * height / rows;
        const sw = width / cols, sh = height / rows;
        const cx = left + sw / 2, cy = top + sh / 2;
        const rotation = progress * ((id * 17 % 11) - 5) * 0.38;
        const c = Math.cos(rotation), s = Math.sin(rotation);
        const dx = (cx - width / 2) * progress * 2 + ((id * 13 % 7) - 3) * progress * width * 0.035;
        const dy = (cy - height / 2) * progress + progress * progress * height * 1.4;
        const radius = Math.hypot(sw, sh) / 2;
        const x0 = Math.max(0, Math.floor(cx + dx - radius)), x1 = Math.min(width, Math.ceil(cx + dx + radius));
        const y0 = Math.max(0, Math.floor(cy + dy - radius)), y1 = Math.min(height, Math.ceil(cy + dy + radius));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const px = x + 0.5 - cx - dx, py = y + 0.5 - cy - dy;
          const sx = c * px + s * py + cx, sy = -s * px + c * py + cy;
          const u = (sx - left) / sw, v = (sy - top) / sh;
          if (u < 0 || u >= 1 || v < 0 || v >= 1 || (half === 0 ? u + v > 1 : u + v <= 1)) continue;
          map[y * width + x] = Math.floor(sy) * width + Math.floor(sx);
        }
      }
    } else if (effect === "bounce-3d") bounce3d(map, width, height, t);
    else crane(map, width, height, t);
  }
  return maps;
}
