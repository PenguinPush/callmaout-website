// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
import { asset } from "../asset";
import type { PhotoAnalysis } from "./messages";
import { layoutStickers, randomFromSeed } from "./sticker-layout";

// Pixel coordinates in the original photo, matching MediaPipe's boundingBox.
export type PhotoBox = { originX: number; originY: number; width: number; height: number };

export function smileLabel(result: PhotoAnalysis["result"], threshold: number) {
  if ("error" in result) return "Smile analysis failed";
  if (!result.face) return "No face detected";
  const smiling = result.smile >= threshold;
  const confidence = Math.round((smiling ? result.smile : 1 - result.smile) * 100);
  return `${smiling ? "Smiling" : "Not smiling"} · ${confidence}% confidence`;
}


// Bump when stored JPEGs use an obsolete decoration style.
export const PHOTO_STYLE_VERSION = 6;
export const stickerSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

// Must match the files in public/photos: label-{mood}-1..5.png and sticker-{mood}-1..6.png.
const LABEL_COUNT = 5;
const STICKER_COUNT = 6;

type StickerSet = { labels: ImageBitmap[]; stickers: ImageBitmap[] };
let assets: Promise<{ laugh: StickerSet; neutral: StickerSet }> | null = null;

// Decode once, at display-sized resolution. No network or decoding in the warm draw path.
export function loadStickers() {
  if (assets) return assets;
  const loadSet = async (mood: string): Promise<StickerSet> => {
    const load = async (kind: string, index: number) => {
      const response = await fetch(asset(`photos/${kind}-${mood}-${index + 1}.png`));
      if (!response.ok) throw new Error(`Sticker unavailable: ${response.status}`);
      return createImageBitmap(await response.blob(), { resizeWidth: kind === "label" ? 768 : 256, resizeQuality: "high" });
    };
    const [labels, stickers] = await Promise.all([
      Promise.all(Array.from({ length: LABEL_COUNT }, (_, i) => load("label", i))),
      Promise.all(Array.from({ length: STICKER_COUNT }, (_, i) => load("sticker", i))),
    ]);
    return { labels, stickers };
  };
  const loading = Promise.all([loadSet("laugh"), loadSet("neutral")]).then(([laugh, neutral]) => ({ laugh, neutral }));
  assets = loading;
  loading.catch(() => { if (assets === loading) assets = null; });
  return loading;
}

export async function drawPhotoStickers(ctx: CanvasRenderingContext2D, boxes: readonly PhotoBox[], analysis: PhotoAnalysis["result"], threshold: number, seed = stickerSeed()) {
  // If detection failed, don't risk putting artwork over an unknown face location.
  if ("error" in analysis) return;
  const sets = await loadStickers();
  const set = analysis.face && analysis.smile >= threshold ? sets.laugh : sets.neutral;
  const random = randomFromSeed(seed);
  const pool = [...set.stickers];
  const images = [set.labels[Math.floor(random() * set.labels.length)]];
  for (let i = 0; i < 3; i++) images.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  const placements = layoutStickers(ctx.canvas.width, ctx.canvas.height, boxes, images, seed);
  // Artwork is the final processing stage; the label is painted last of all.
  const paintOrder = [...placements.filter((p) => p.index !== 0), ...placements.filter((p) => p.index === 0)];
  for (const placement of paintOrder) {
    ctx.save();
    ctx.translate(placement.x, placement.y);
    ctx.rotate(placement.angle);
    ctx.drawImage(images[placement.index], -placement.width / 2, -placement.height / 2, placement.width, placement.height);
    ctx.restore();
  }
}
