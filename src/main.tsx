import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { asset } from "./asset";
import { analyzeFace } from "./extension/face";
import spec from "./extension/face-spec.json";
import { encodeGif, warmGifWorker } from "./extension/gif-client";
import { drawPhotoStickers, loadStickers, smileLabel } from "./extension/photo-overlays";
import { version } from "./extension/version.json";
import "./extension/styles.css";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Gif = { state: "idle" } | { state: "making" } | { state: "ready"; dataUrl: string; label: string } | { state: "failed"; message: string };

function App() {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [gif, setGif] = useState<Gif>({ state: "idle" });

  useEffect(() => {
    if (!video.current) return;
    video.current.srcObject = stream;
    // autoplay alone doesn't start a video that isn't on screen.
    if (stream) void video.current.play().catch(() => {});
  }, [stream]);
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream]);
  // Ask for the camera as soon as the site opens, so the GIF is instant when you download.
  useEffect(() => {
    void startCamera();
  }, []);

  // One shared request, so pressing Download while the first permission prompt is open doesn't ask twice.
  const opening = useRef<Promise<MediaStream | null> | null>(null);
  function startCamera() {
    opening.current ??= navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
      .then((opened) => {
        setCameraError("");
        setStream(opened);
        void warmGifWorker().catch(() => {});
        void loadStickers().catch(() => {});
        return opened;
      })
      .catch((e) => {
        setCameraError(String(e));
        opening.current = null; // let Download ask again
        return null;
      });
    return opening.current;
  }

  // The same steps the extension takes before sending a GIF: a 480px frame, the smile check,
  // label and stickers around the face, then the animated GIF.
  async function makeGif() {
    setGif({ state: "making" });
    try {
      const wasOff = !stream;
      if (!(await startCamera())) throw new Error("the camera is off, so there's no gif this time");
      for (let tries = 0; !(video.current && video.current.readyState >= 2 && video.current.videoWidth) && tries < 100; tries++) await sleep(50);
      const source = video.current;
      if (!source?.videoWidth) throw new Error("the camera didn't start");
      // A camera that's just turned on needs a moment to get its exposure right.
      if (wasOff) await sleep(600);
      const scale = Math.min(1, 480 / Math.max(source.videoWidth, source.videoHeight));
      const frame = document.createElement("canvas");
      frame.width = Math.round(source.videoWidth * scale);
      frame.height = Math.round(source.videoHeight * scale);
      frame.getContext("2d")!.drawImage(source, 0, 0, frame.width, frame.height);
      const result = await analyzeFace(frame);
      const output = document.createElement("canvas");
      output.width = frame.width;
      output.height = frame.height;
      const context = output.getContext("2d")!;
      context.drawImage(frame, 0, 0);
      await drawPhotoStickers(context, result.face ? result.boxes : [], result, spec.smileThreshold);
      const { dataUrl } = await encodeGif(output);
      setGif({ state: "ready", dataUrl, label: smileLabel(result, spec.smileThreshold) });
    } catch (e) {
      setGif({ state: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  }

  function download() {
    const link = document.createElement("a");
    link.href = asset("callmaout.zip");
    link.download = `callmaout-${version}.zip`;
    link.click();
    void makeGif();
  }

  return (
    <main className="settings-page mx-auto flex max-w-md flex-col gap-8 px-4 py-12 text-sm">
      <h1 className="text-xl font-bold normal-case">calLMAOut</h1>

      <section className="flex flex-col gap-2">
        <p>
          A Chrome extension to catch when you type LMAO with a straight face. Whenever you "laugh", it sends a photo of how you're actually reacting.
          If you go too far, you might owe the chat an apology.,,
        </p>
        <p className="text-neutral-500">Faces are checked on your computer. Nothing is uploaded except what you send.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">how it works</h2>
        <p>
          jev detects whether your message is supposed to express laughter or not, and a custom trained CV model asks whether or not you're actually laughing.
        </p>
        <p className="text-neutral-500">Faces are checked on your computer. Nothing is uploaded except what you send.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Download</h2>
        <button className="self-start" onClick={download} disabled={gif.state === "making"}>
          Download for Chrome
        </button>
        <p className="text-neutral-500">Version {version}. Unzip it, open chrome://extensions, turn on Developer mode, click Load unpacked and pick the folder.</p>
        {cameraError && <p className="text-neutral-500">Camera unavailable: {cameraError}. Allow camera access for this page to see your GIF.</p>}
        {gif.state === "making" && <p className="text-neutral-500">Making your GIF…</p>}
        {gif.state === "failed" && <p className="text-neutral-500">No GIF: {gif.message}.</p>}
        {gif.state === "ready" && (
          <figure className="flex flex-col gap-2">
            <img src={gif.dataUrl} alt={`Your GIF: ${gif.label}`} className="w-full" />
            <figcaption className="text-neutral-500">
              {gif.label}. this is what you look like "laughing". <button onClick={makeGif}>make another</button>
            </figcaption>
          </figure>
        )}
      </section>

      {/* No visible preview: the camera only feeds the GIF. It stays rendered (1px, transparent)
          rather than display:none, so the browser keeps painting new frames into it. */}
      <video ref={video} autoPlay muted playsInline aria-hidden="true" className="pointer-events-none fixed top-0 left-0 size-px opacity-0" />

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Demo</h2>
        {/* YouTube's privacy-enhanced player: no cookies until the visitor presses play. */}
        <iframe
          src="https://www.youtube-nocookie.com/embed/Jc_cGOw6P00"
          title="calLMAOut demo"
          allow="encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          className="aspect-video w-full border-0"
        />
      </section>

      <Footer />
    </main>
  );
}

// Adapted from FaunaDex's footer: same links layout, in this site's plain underlined style
// (no hover animation, since the site turns animations off).
const FOOTER_LINKS = [
  ["Github Repository", "https://github.com/PenguinPush/calLMAOut"],
  ["Report a Bug", "mailto:andrewdai.dev@gmail.com"],
  ["View Dataset", "https://fei.edu.br/~cet/facedatabase.html"],
];

function Footer() {
  const link = "underline underline-offset-2 hover:text-black";
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-xs text-neutral-500">
      <span>
        Made by{" "}
        <a href="https://andrewd.ai" target="_blank" rel="noopener noreferrer" className={link}>
          Andrew Dai
        </a>
      </span>
      {FOOTER_LINKS.map(([label, href]) => (
        <a key={href} href={href} target="_blank" rel="noopener noreferrer" className={link}>
          {label}
        </a>
      ))}
    </footer>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
