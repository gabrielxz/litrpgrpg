/** What speech-to-text needs from listening: the vocabulary to bias a model with, and the transcript scorer. */
export { vocabulary } from "./vocabulary.ts";
export { type TranscriptScore, editDistance, matchedWords, scoreTranscript, words } from "./transcript-score.ts";
