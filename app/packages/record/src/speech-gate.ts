/**
 * The tab's speech gate (app/DESIGN.md, "Voice capture"): a frame goes out only while its level is
 * at VOICE_LEVEL or more and for HANG_MS after, led by the PREROLL_FRAMES before it. The tab runs it
 * when it sends only speech, and `stt-eval --gate` runs the same code against rendered scenes.
 */

/** A frame's level (0 to 1: four times its RMS, capped) at which it counts as speech. */
export const VOICE_LEVEL = 0.1;
/** How long sending continues after the last voiced frame: the pauses inside a sentence. */
export const HANG_MS = 1500;
/** Frames held before speech starts and sent ahead of it: half a second of 100 ms frames. */
export const PREROLL_FRAMES = 5;

export class SpeechGate<F> {
  private held: F[] = [];
  private sendingUntil = -Infinity;

  /** Takes a frame, its level, and the time in milliseconds; returns the frames to send now, in order. */
  push(frame: F, level: number, now: number): F[] {
    const out: F[] = [];
    if (level >= VOICE_LEVEL) {
      if (now >= this.sendingUntil) out.push(...this.held.splice(0));
      this.sendingUntil = now + HANG_MS;
    }
    if (now < this.sendingUntil) out.push(frame);
    else {
      this.held.push(frame);
      if (this.held.length > PREROLL_FRAMES) this.held.shift();
    }
    return out;
  }
}
