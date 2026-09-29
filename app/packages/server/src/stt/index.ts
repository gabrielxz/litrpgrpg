/**
 * The speech-to-text adapters under comparison (app/DESIGN.md, M3, "Speech-to-text adapter"), each
 * available when its key is set. The one chosen becomes the server's transcriber.
 */
import type { Transcriber } from "../listening.ts";
import { assemblyAi } from "./assemblyai.ts";
import { elevenLabs } from "./elevenlabs.ts";
import { soniox } from "./soniox.ts";
import { speechmatics } from "./speechmatics.ts";

function available(env: NodeJS.ProcessEnv): Record<string, Transcriber> {
  const out: Record<string, Transcriber> = {};
  if (env.ASSEMBLYAI_API_KEY) {
    out.assemblyai = assemblyAi("universal-3-6-pro", env.ASSEMBLYAI_API_KEY);
    out["assemblyai-streaming"] = assemblyAi("universal-streaming-english", env.ASSEMBLYAI_API_KEY);
  }
  if (env.SONIOX_API_KEY) out.soniox = soniox(env.SONIOX_API_KEY);
  if (env.SPEECHMATICS_API_KEY) out.speechmatics = speechmatics(env.SPEECHMATICS_API_KEY);
  if (env.ELEVENLABS_API_KEY) out.elevenlabs = elevenLabs(env.ELEVENLABS_API_KEY);
  return out;
}

export const transcribers = available(process.env);
