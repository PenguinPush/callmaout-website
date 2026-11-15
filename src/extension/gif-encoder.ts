// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { transitionMaps, TRANSITIONS, TRANSITION_SPECS, PHOTO_HOLD_MS, END_HOLD_MS, EFFECT_COLORS, type Transition } from "./gif-transitions";

let cachedSize = "";
const cachedMaps = new Map<Transition, Int32Array[]>();

export function prepareTransitions(width: number, height: number) {
  const size = `${width}x${height}`;
  if (cachedSize !== size) {
    cachedMaps.clear();
    cachedSize = size;
  }
  for (const effect of TRANSITIONS) {
    if (!cachedMaps.has(effect)) cachedMaps.set(effect, transitionMaps(width, height, effect));
  }
}

export function encodeTransition(rgba: Uint8Array, width: number, height: number, effect: Transition, entrance: Transition): Uint8Array {
  if (entrance === effect) throw new Error("Entrance and exit transitions must differ");
  if (width < 1 || height < 1 || width > 480 || height > 480 || rgba.length !== width * height * 4) throw new Error("Invalid GIF frame dimensions");
  prepareTransitions(width, height);
  // Quantize just the composed photo; every animation frame reuses its palette.
  // Bound palette work independently of photo detail; full-resolution quantization
  // can dominate encoding on noisy webcam frames. Sample at most 4096 pixels.
  const stride = Math.max(1, Math.ceil(width * height / 4096));
  const sample = new Uint8Array(Math.ceil(width * height / stride) * 4);
  for (let pixel = 0, out = 0; pixel < width * height; pixel += stride, out += 4) {
    sample.set(rgba.subarray(pixel * 4, pixel * 4 + 4), out);
  }
  const palette = quantize(sample, 256 - EFFECT_COLORS.length, { format: "rgb444" });
  // Map photo colors BEFORE adding transparency so real black pixels stay opaque.
  const source = applyPalette(rgba, palette, "rgb444");
  for (let i = 0; i < source.length; i++) source[i] = rgba[i * 4 + 3] === 0 ? 0 : source[i] + 1;
  palette.unshift([0, 0, 0]);
  // Index 0 is also the GIF logical background. Restore it after every frame
  // so moving/folding photos leave transparent space rather than image trails.
  const transparency = { transparent: true, transparentIndex: 0, dispose: 2 };
  const gif = GIFEncoder();
  const pixels = new Uint8Array(width * height);
  let first = true;
  const write = (frame: Uint8Array, delay: number) => {
    gif.writeFrame(frame, width, height, {
      ...(first ? { palette, repeat: 0 } : {}), delay, ...transparency,
    });
    first = false;
  };
  const writeMap = (map: Int32Array, delay: number) => {
    for (let i = 0; i < pixels.length; i++) pixels[i] = map[i] < 0 ? 0 : source[map[i]];
    write(pixels, delay);
  };
  // Play the entrance geometry in reverse: transparent -> assembled photo.
  // Both directions share the same cached maps and the photo's single palette.
  const incoming = cachedMaps.get(entrance)!;
  for (let frame = incoming.length - 1; frame >= 0; frame--) {
    writeMap(incoming[frame], TRANSITION_SPECS[entrance].delay);
  }
  write(source, PHOTO_HOLD_MS);
  const outgoing = cachedMaps.get(effect)!;
  for (let frame = 0; frame < outgoing.length; frame++) {
    writeMap(outgoing[frame], frame === outgoing.length - 1 ? END_HOLD_MS : TRANSITION_SPECS[effect].delay);
  }
  gif.finish();
  return gif.bytes();
}
