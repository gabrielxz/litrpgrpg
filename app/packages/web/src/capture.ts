/**
 * The tab's microphone: 16 kHz mono PCM16 in 100 ms frames, each with its loudness, for the live
 * socket (app/DESIGN.md, "Voice capture"). The browser's echo cancellation and noise suppression
 * stay on. Stopping releases the microphone, so the browser's own indicator goes out with it.
 */

export const FRAME_SAMPLES = 1600;
const TARGET_RATE = 16_000;

/** Runs on the audio thread: resamples whatever rate the device gives to 16 kHz and cuts frames. */
const WORKLET = `
class Frames extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / ${TARGET_RATE};
    this.pos = 0;
    this.prev = 0;
    this.frame = new Int16Array(${FRAME_SAMPLES});
    this.n = 0;
    this.sum = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    // Linear interpolation between the previous sample and this block's.
    while (this.pos < input.length) {
      const i = Math.floor(this.pos);
      const f = this.pos - i;
      const a = i === 0 ? this.prev : input[i - 1];
      const b = input[i];
      const v = Math.max(-1, Math.min(1, a + (b - a) * f));
      this.frame[this.n++] = v < 0 ? v * 32768 : v * 32767;
      this.sum += v * v;
      if (this.n === ${FRAME_SAMPLES}) {
        const level = Math.min(1, Math.sqrt(this.sum / ${FRAME_SAMPLES}) * 4);
        this.port.postMessage({ pcm: this.frame.buffer, level }, [this.frame.buffer]);
        this.frame = new Int16Array(${FRAME_SAMPLES});
        this.n = 0;
        this.sum = 0;
      }
      this.pos += this.step;
    }
    this.pos -= input.length;
    this.prev = input[input.length - 1];
    return true;
  }
}
registerProcessor("gradebreaker-frames", Frames);
`;

export interface Microphone {
  stop(): void;
}

/** Why a microphone could not open, in words for the capture bar. */
export class MicrophoneError extends Error {}
/** The page has not been clicked since it loaded, so the browser holds audio back. */
export class NeedsClick extends MicrophoneError {}

export async function openMicrophone(onFrame: (pcm: ArrayBuffer, level: number) => void): Promise<Microphone> {
  if (!navigator.mediaDevices?.getUserMedia) throw new MicrophoneError("This browser gives the page no microphone.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    const name = (e as DOMException).name;
    throw new MicrophoneError(
      name === "NotAllowedError"
        ? "The browser refused the microphone. Allow it for this site, then try again."
        : name === "NotFoundError"
          ? "No microphone was found."
          : `The microphone did not open (${name || String(e)}).`,
    );
  }
  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  // A page nobody has clicked since it loaded may not start audio; the capture bar offers a button.
  if (ctx.state !== "running") await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 500))]);
  if (ctx.state !== "running") {
    for (const t of stream.getTracks()) t.stop();
    void ctx.close();
    throw new NeedsClick("The browser waits for a click before it starts the microphone.");
  }
  const source = ctx.createMediaStreamSource(stream);
  // A node with no outputs is a sink the audio thread still runs.
  const node = new AudioWorkletNode(ctx, "gradebreaker-frames", { numberOfInputs: 1, numberOfOutputs: 0 });
  node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => onFrame(e.data.pcm, e.data.level);
  source.connect(node);
  return {
    stop() {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      for (const t of stream.getTracks()) t.stop();
      void ctx.close();
    },
  };
}
