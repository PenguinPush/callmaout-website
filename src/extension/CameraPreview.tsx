// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
import { useEffect, useRef, useState, type RefObject } from "react";
import { StickerRandomizer } from "./sticker-randomizer";
import { analyzeFace } from "./face";
import { drawPhotoStickers, loadStickers, smileLabel, stickerSeed } from "./photo-overlays";

// One analysis at a time, at most ~7fps; the video itself stays smooth.
export function CameraPreview({ video, threshold, deviceId }: {
  video: RefObject<HTMLVideoElement | null>;
  threshold: number;
  deviceId: string;
}) {
  const overlay = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Looking for a face…");

  useEffect(() => {
    const overlayCanvas = overlay.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const frame = document.createElement("canvas");
    const decorated = document.createElement("canvas");
    const randomizer = new StickerRandomizer(stickerSeed);
    const motionFrame = document.createElement("canvas");
    motionFrame.width = 32;
    motionFrame.height = 18;
    const motionContext = motionFrame.getContext("2d", { willReadFrequently: true })!;
    const luminance = new Float32Array(32 * 18);
    void loadStickers().catch(() => {});
    const tick = async () => {
      try {
        const source = video.current;
        if (!document.hidden && source && source.readyState >= 2 && source.videoWidth) {
          // Limit inference input size; boxes use this same coordinate space.
          frame.width = Math.min(640, source.videoWidth);
          frame.height = Math.round(frame.width * source.videoHeight / source.videoWidth);
          frame.getContext("2d")!.drawImage(source, 0, 0, frame.width, frame.height);
          const result = await analyzeFace(frame);
          if (cancelled) return;
          const target = overlay.current;
          if (target) {
            decorated.width = frame.width;
            decorated.height = frame.height;
            const context = decorated.getContext("2d")!;
            // Mirror face coordinates only, keeping the artwork readable.
            const boxes = result.face ? result.boxes.map((box) => ({
              ...box, originX: frame.width - box.originX - box.width,
            })) : [];
            motionContext.drawImage(frame, 0, 0, 32, 18);
            const pixels = motionContext.getImageData(0, 0, 32, 18).data;
            for (let i = 0; i < luminance.length; i++) {
              luminance[i] = pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114;
            }
            const seed = randomizer.update({
              width: frame.width, height: frame.height, boxes, luminance,
              expression: !result.face ? "no-face" : result.smile >= threshold ? "smiling" : "neutral",
            }, performance.now());
            await drawPhotoStickers(context, boxes, result, threshold, seed);
            if (cancelled) return;
            target.width = frame.width;
            target.height = frame.height;
            target.getContext("2d")!.drawImage(decorated, 0, 0);
            const label = smileLabel(result, threshold);
            setStatus(label);
          }
        }
      } catch {
        if (!cancelled) {
          const target = overlay.current;
          target?.getContext("2d")?.clearRect(0, 0, target.width, target.height);
          setStatus("Smile analysis unavailable");
        }
      }
      if (!cancelled) timer = setTimeout(() => void tick(), 150);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      overlayCanvas?.getContext("2d")?.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    };
  }, [video, threshold, deviceId]);

  return <>
    <canvas ref={overlay} className="pointer-events-none absolute inset-0 h-full w-full" aria-label={status} />
    <span className="sr-only">{status}</span>
  </>;
}
