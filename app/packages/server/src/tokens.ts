import { createHash, randomBytes, randomUUID } from "node:crypto";

/** A bearer token: shown once, stored only as its hash. */
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** An invite code: short enough to paste, long enough not to guess. */
export const newInviteCode = () => randomBytes(12).toString("base64url");

export const newId = () => randomUUID();

/** A stable hash of a rules snapshot, to notice when a version's content changed under it. */
export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");
