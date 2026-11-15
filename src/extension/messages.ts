// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
import type { PreviewSignal } from "./apology-preview";
import type { Transition } from "./gif-transitions";
import type { PhotoBox } from "./photo-overlays";

export type WatchConfig = { deviceId: string; threshold: number; rememberSmiles: boolean; smileMemoryMs: number };

export type Message =
  | { type: "classify"; text: string }
  | { type: "warm" }
  | { type: "capture" }
  | { type: "log"; text: string }
  | { type: "ping" }
  // Sent while you type; keystrokes keep the remembered smile from expiring.
  | { type: "typing" }
  | { type: "forget-smile" }
  // Only confirmed sends update the streak; neutral non-laughs leave it alone.
  | { type: "strike"; analysis: PhotoAnalysis["result"]; laugh: boolean }
  | { type: "message-face" }
  | { type: "offscreen-message-face" }
  | { type: "apology-prepare" }
  | { type: "apology-done" }
  | { type: "open-options" }
  // null stops watching.
  | { type: "offscreen-watch"; config: WatchConfig | null }
  | { type: "offscreen-remembered" }
  | { type: "offscreen-typing" }
  | { type: "offscreen-forget" }
  | { type: "offscreen-warm"; config: WatchConfig }
  // The offscreen page can't read chrome.storage, so settings travel with the request.
  | { type: "offscreen-capture"; config: WatchConfig }
  // Scores the last captured photo, or `image` (a data URL) if given.
  | { type: "offscreen-analyze"; image?: string };

// `remembered` is set when the photo is a smile from while you were typing, not a live shot.
export type CaptureResult = { dataUrl: string; mimeType: "image/gif"; effect: Transition; entrance: Transition; durationMs: number; prepareMs: number; sourceAgeMs: number; analysis: PhotoAnalysis["result"]; remembered?: { smile: number; ageMs: number } } | { error: string };

export type StrikeResult = { apologyDue: boolean };

// Over the "apology" port between the modal (content script) and the offscreen recorder.
export type ApologyRequest = { type: "record" } | { type: "preview-signal"; signal: PreviewSignal };
export type ApologyUpdate =
  | { type: "ready" }
  | { type: "preview-signal"; signal: PreviewSignal }
  | { type: "progress"; remainingMs: number }
  | { type: "processing"; fraction: number }
  | { type: "done"; dataUrl: string; mimeType: string; finishMs: number }
  | { type: "error"; message: string; microphone?: boolean };

export type FaceResult = { face: false } | { face: true; smile: number; ms: number; crop: string; boxes: PhotoBox[] };

export type RememberedPhoto = { dataUrl: string; ageMs: number; remembered: boolean; effect: Transition; entrance: Transition; durationMs: number; prepareMs: number } | null;

export type AnalyzeResult = FaceResult | { error: string };

// Stored separately from the image; the ID prevents stale analysis labeling a newer photo.
export type PhotoAnalysis = {
  photoId: string;
  result: { face: false } | { face: true; smile: number } | { error: string };
};

export type Verdict = { laugh: boolean; why: string };

export type LogEntry = { at: number; where: string; text: string };

export function send<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
