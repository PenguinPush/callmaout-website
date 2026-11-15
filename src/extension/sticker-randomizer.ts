// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
import type { PhotoBox } from "./photo-overlays";

type Observation = {
  width: number;
  height: number;
  boxes: readonly PhotoBox[];
  expression: "smiling" | "neutral" | "no-face";
  luminance: Float32Array;
};

// Reuses existing face detection plus a tiny image sample. Motion is compared
// with the last shuffle, so slow movement accumulates while camera noise doesn't.
export class StickerRandomizer {
  private previous: Observation | null = null;
  private lastShuffle = -Infinity;
  private seed: number;

  constructor(private readonly randomSeed: () => number) {
    this.seed = randomSeed();
  }

  update(observation: Observation, now: number) {
    const previous = this.previous;
    const changed = !previous || observation.expression !== previous.expression || observation.boxes.length !== previous.boxes.length;
    const moved = previous && (this.faceMoved(previous, observation) || this.sceneMoved(previous.luminance, observation.luminance));
    // Expression changes are immediate. Sustained movement can shuffle ~5x/sec;
    // a short interval keeps detector jitter from becoming a flashing overlay.
    if (changed || now - this.lastShuffle >= 2000 || (moved && now - this.lastShuffle >= 180)) {
      this.seed = this.randomSeed();
      this.previous = { ...observation, boxes: observation.boxes.map((box) => ({ ...box })), luminance: observation.luminance.slice() };
      this.lastShuffle = now;
    }
    return this.seed;
  }

  private faceMoved(a: Observation, b: Observation) {
    return b.boxes.some((box, i) => {
      const old = a.boxes[i];
      if (!old) return true;
      const dx = (box.originX + box.width / 2) / b.width - (old.originX + old.width / 2) / a.width;
      const dy = (box.originY + box.height / 2) / b.height - (old.originY + old.height / 2) / a.height;
      const dw = box.width / b.width - old.width / a.width;
      const dh = box.height / b.height - old.height / a.height;
      return Math.hypot(dx, dy) >= 0.012 || Math.abs(dw) >= 0.012 || Math.abs(dh) >= 0.012;
    });
  }

  private sceneMoved(a: Float32Array, b: Float32Array) {
    if (a.length !== b.length) return true;
    if (!a.length) return false;
    let brightness = 0;
    for (let i = 0; i < a.length; i++) brightness += b[i] - a[i];
    brightness /= a.length;
    let changed = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(b[i] - a[i] - brightness) >= 20) changed++;
    return changed / a.length >= 0.08;
  }
}
