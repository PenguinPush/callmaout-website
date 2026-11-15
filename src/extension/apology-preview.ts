// Copied from the callmaout extension by scripts/sync-extension.mjs. Edit it there, then run `npm run sync`.
// Native video transport between the offscreen camera and the content-script
// modal. Extension ports carry signaling only, never encoded image snapshots.
export type PreviewSignal =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit };

export class ApologyPreview {
  private readonly peer = new RTCPeerConnection({ iceServers: [] });
  private candidates: RTCIceCandidateInit[] = [];
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  private readonly connectionTimer: ReturnType<typeof setTimeout>;

  constructor(
    private readonly signal: (message: PreviewSignal) => void,
    private readonly onError: (error: unknown) => void,
    onStream?: (stream: MediaStream) => void,
  ) {
    this.connectionTimer = setTimeout(() => {
      if (!this.closed && this.peer.connectionState !== "connected") onError(new Error("Camera preview timed out; try again"));
    }, 15000);
    this.peer.onicecandidate = ({ candidate }) => {
      if (!this.closed && candidate) this.signal({ candidate: candidate.toJSON() });
    };
    this.peer.ontrack = ({ track, streams }) => {
      if (!this.closed) onStream?.(streams[0] ?? new MediaStream([track]));
    };
    this.peer.onconnectionstatechange = () => {
      if (this.peer.connectionState === "connected") clearTimeout(this.connectionTimer);
      if (!this.closed && this.peer.connectionState === "failed") onError(new Error("Camera preview connection failed"));
    };
  }

  async offer(stream: MediaStream) {
    for (const track of stream.getVideoTracks()) {
      // Share the existing camera track, without forwarding microphone audio.
      this.peer.addTransceiver(track, { direction: "sendonly", streams: [stream] });
    }
    await this.peer.setLocalDescription(await this.peer.createOffer());
    if (!this.closed) this.signal({ description: this.peer.localDescription!.toJSON() });
  }

  receive(message: PreviewSignal) {
    // ICE can arrive before the offer/answer, and description handling is async.
    this.queue = this.queue.then(async () => {
      if (this.closed) return;
      if ("candidate" in message) {
        if (!this.peer.remoteDescription) this.candidates.push(message.candidate);
        else await this.peer.addIceCandidate(message.candidate);
        return;
      }
      await this.peer.setRemoteDescription(message.description);
      for (const candidate of this.candidates) await this.peer.addIceCandidate(candidate);
      this.candidates = [];
      if (message.description.type === "offer") {
        await this.peer.setLocalDescription(await this.peer.createAnswer());
        if (!this.closed) this.signal({ description: this.peer.localDescription!.toJSON() });
      }
    }).catch((error: unknown) => { if (!this.closed) this.onError(error); });
    return this.queue;
  }

  close() {
    this.closed = true;
    clearTimeout(this.connectionTimer);
    this.candidates = [];
    this.peer.onicecandidate = this.peer.ontrack = this.peer.onconnectionstatechange = null;
    this.peer.close();
    // The recording session owns the camera track and decides when to stop it.
  }
}
