// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
import type { PhotoBox } from "./photo-overlays";

export type StickerSize = { width: number; height: number };
export type StickerPlacement = StickerSize & { index: number; x: number; y: number; angle: number; bounds: PhotoBox };

export function randomFromSeed(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function overlaps(a: PhotoBox, b: PhotoBox) {
  return a.originX < b.originX + b.width && a.originX + a.width > b.originX &&
    a.originY < b.originY + b.height && a.originY + a.height > b.originY;
}

// Bounded work: four items, four sizes, 80 candidates each. Rotated enclosing
// rectangles protect the entire face, including transparent sticker corners.
function tryLayout(width: number, height: number, faces: readonly PhotoBox[], sizes: readonly StickerSize[], seed: number): StickerPlacement[] {
  if (width <= 0 || height <= 0) return [];
  const random = randomFromSeed(seed);
  const unit = Math.min(width, height);
  const margin = unit * 0.025;
  const obstacles = faces.filter((box) => [box.originX, box.originY, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0)
    .map((box) => ({ originX: box.originX - margin, originY: box.originY - margin, width: box.width + margin * 2, height: box.height + margin * 2 }));
  const result: StickerPlacement[] = [];
  sizes.slice(0, 4).forEach((size, index) => {
    if (size.width <= 0 || size.height <= 0) return;
    // The label is a banner nearly as wide as the photo, so it only tilts slightly (more would
    // push its corners out of frame). Stickers stay small and tilt freely.
    const angle = (random() * 2 - 1) * (index === 0 ? 0.05 : 0.38);
    const desiredWidth = index === 0 ? width * (0.88 + random() * 0.06) : unit * (0.16 + random() * 0.32);
    const scale = Math.min(desiredWidth / size.width, (index === 0 ? height * 0.5 : unit * 0.5) / size.height);
    // The label tries every size from full width down, so it lands as large as the space around the
    // faces allows instead of being dropped.
    for (const shrink of index === 0 ? [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3] : [1, 0.8, 0.6, 0.45]) {
      const w = size.width * scale * shrink;
      const h = size.height * scale * shrink;
      const bw = Math.abs(Math.cos(angle)) * w + Math.abs(Math.sin(angle)) * h;
      const bh = Math.abs(Math.sin(angle)) * w + Math.abs(Math.cos(angle)) * h;
      const freeX = width - margin * 2 - bw;
      const freeY = height - margin * 2 - bh;
      if (freeX < 0 || freeY < 0) continue;
      // Random positions, then jittered cells to search the whole image without fixed anchors.
      const offset = Math.floor(random() * 48);
      for (let attempt = 0; attempt < 80; attempt++) {
        const grid = (attempt - 32 + offset + 48) % 48;
        const x = margin + (attempt < 32 ? random() : ((grid % 8) + random()) / 8) * freeX;
        const y = margin + (attempt < 32 ? random() : (Math.floor(grid / 8) + random()) / 6) * freeY;
        const bounds = { originX: x, originY: y, width: bw, height: bh };
        if (obstacles.some((box) => overlaps(bounds, box))) continue;
        result.push({ index, x: x + bw / 2, y: y + bh / 2, width: w, height: h, angle, bounds });
        obstacles.push({ originX: x - margin / 2, originY: y - margin / 2, width: bw + margin, height: bh + margin });
        return;
      }
    }
    // A close-up can leave no safe space. Omit an item rather than cover a face.
  });
  return result;
}

// Retry a few randomized arrangements when a large label crowds out a sticker.
export function layoutStickers(width: number, height: number, faces: readonly PhotoBox[], sizes: readonly StickerSize[], seed: number): StickerPlacement[] {
  let best: StickerPlacement[] = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    const layout = tryLayout(width, height, faces, sizes, (seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
    if (layout.length > best.length) best = layout;
    if (best.length === Math.min(4, sizes.length)) break;
  }
  return best;
}
