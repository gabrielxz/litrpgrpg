/**
 * Scores a transcript against what was said, one speaker at a time: word error rate over the
 * speaker's whole track, and term accuracy, the share of the vocabulary's terms said that come
 * through intact. Streaming segments do not line up with a script's lines, so the speaker's lines
 * are joined in order and aligned as one text.
 */

/**
 * Lowercase words with punctuation removed; hyphens split ("Gate-Runner" is "gate runner"), and
 * number words read as digits ("seventy one" is "71"), since a model writes either.
 */
export function words(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return numbersAsDigits(raw);
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "one hundred and twenty five" to "125": units, tens, and hundreds, which is what a table says. */
function numbersAsDigits(list: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.length; ) {
    let value = 0;
    let j = i;
    let any = false;
    for (;;) {
      const w = list[j];
      if (w === undefined) break;
      if (w in UNITS && !(any && value % 10 !== 0)) value += UNITS[w]!;
      else if (w in TENS && value % 100 === 0) value += TENS[w]!;
      else if (w === "hundred" && any && value > 0 && value < 10) value *= 100;
      else if (w === "and" && any && value % 100 === 0 && value >= 100 && list[j + 1] && (list[j + 1]! in UNITS || list[j + 1]! in TENS)) {
        j++;
        continue;
      } else break;
      any = true;
      j++;
    }
    if (any) {
      out.push(String(value));
      i = j;
    } else out.push(list[i++]!);
  }
  return out;
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
