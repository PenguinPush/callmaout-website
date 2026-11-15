// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
import { encodeTransition, prepareTransitions } from "./gif-encoder";
import type { Transition } from "./gif-transitions";

type Request = { id: number; width: number; height: number; pixels?: ArrayBuffer; effect?: Transition; entrance?: Transition };
self.onmessage = ({ data }: MessageEvent<Request>) => {
  try {
    if (!data.pixels) {
      prepareTransitions(data.width, data.height);
      self.postMessage({ id: data.id });
      return;
    }
    if (!data.effect || !data.entrance) throw new Error("Both GIF transitions are required");
    const start = performance.now();
    const bytes = encodeTransition(new Uint8Array(data.pixels), data.width, data.height, data.effect, data.entrance);
    self.postMessage({ id: data.id, bytes, ms: Math.round(performance.now() - start) }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
