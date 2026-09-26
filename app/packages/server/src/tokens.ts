import { createHash, randomBytes, randomUUID } from "node:crypto";

/** An invite code: short enough to paste, long enough not to guess. */
export const newInviteCode = () => randomBytes(12).toString("base64url");

export const newId = () => randomUUID();

/** A stable hash of a rules snapshot, to notice when a version's content changed under it. */
export const contentHash = (text: string) => createHash("sha256").update(text).digest("hex");
