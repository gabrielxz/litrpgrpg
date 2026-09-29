/**
 * Scores a transcript against what was said, one speaker at a time: word error rate over the
 * speaker's whole track, and term accuracy, the share of the vocabulary's terms said that come
 * through intact. Streaming segments do not line up with a script's lines, so the speaker's lines
 * are joined in order and aligned as one text.
 */

/** Lowercase words with punctuation removed; hyphens split ("Gate-Runner" is "gate runner"). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Word-level edit distance: substitutions, deletions, and insertions. */
export function editDistance(ref: string[], hyp: string[]): number {
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[hyp.length]!;
}

/** How many times a term's words occur in order in a word list. */
function occurrences(list: string[], term: string[]): number {
  let n = 0;
  for (let i = 0; i + term.length <= list.length; i++) if (term.every((w, k) => list[i + k] === w)) n++;
  return n;
}

export interface TranscriptScore {
  words: number;
  /** Edits over reference words. */
  wer: number;
  /** Term occurrences said, and how many the transcript carries (capped at the count said). */
  termsSaid: number;
  termsHeard: number;
  /** Each term said with its counts, for reading what was missed. */
  terms: { term: string; said: number; heard: number }[];
}

export function scoreTranscript(reference: string, hypothesis: string, vocabulary: string[]): TranscriptScore {
  const ref = words(reference);
  const hyp = words(hypothesis);
  const terms = vocabulary
    .map((t) => {
      const w = words(t);
      const said = occurrences(ref, w);
      return { term: t, said, heard: Math.min(said, occurrences(hyp, w)) };
    })
    .filter((t) => t.said > 0);
  return {
    words: ref.length,
    wer: ref.length ? editDistance(ref, hyp) / ref.length : 0,
    termsSaid: terms.reduce((a, t) => a + t.said, 0),
    termsHeard: terms.reduce((a, t) => a + t.heard, 0),
    terms,
  };
}
