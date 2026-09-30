/** The sizes of live drafting's windows (windows.ts), with no Node imports so the web client shows them. */

/** New lines before a pause closes a window. */
export const WINDOW_LINES = 20;
/** New lines that close a window without a pause. */
export const WINDOW_MAX_LINES = 40;
/** How long nobody has spoken before a window closes. */
export const WINDOW_QUIET_MS = 10_000;
/** Lines before a window sent with it as context. */
export const EARLIER_LINES = 40;
