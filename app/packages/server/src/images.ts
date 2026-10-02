/**
 * The images the GM shows at the table (app/DESIGN.md, M1, "Images and handouts"). A content
 * pack's images are files under `app/packs/images/<pack>/<name>.webp`, shipped with the app; an
 * image the GM uploads is stored in Postgres. Who may fetch one is the route's to decide: the
 * GM, or a player it was shown to.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IMAGE_SRC } from "@gradebreaker/record";
import type { Db } from "./db.ts";
import { HttpError } from "./service.ts";

/** Where the packs' images are: `app/packs/images`. */
export const PACK_IMAGES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packs/images");
/** The largest upload taken; the browser shrinks an image well under it before sending. */
export const MAX_IMAGE_BYTES = 4_000_000;
const TYPES = new Set(["image/webp", "image/png", "image/jpeg"]);

export class Images {
  private readonly db: Db;
  private readonly packDir: string;
  constructor(db: Db, packDir: string = PACK_IMAGES) {
    this.db = db;
    this.packDir = packDir;
  }

  /** Stores an upload for a campaign; returns its `src`. */
  async upload(campaignId: string, userId: string, type: string, bytes: Uint8Array): Promise<string> {
    if (!TYPES.has(type)) throw new HttpError(415, "an image is WebP, PNG, or JPEG");
    if (!bytes.length) throw new HttpError(422, "the image is empty");
    if (bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "the image is larger than 4 MB");
    const id = randomUUID();
    await this.db.query("insert into campaign_images (id, campaign_id, uploaded_by, type, bytes) values ($1, $2, $3, $4, $5)", [id, campaignId, userId, type, bytes]);
    return `upload:${id}`;
  }

  /** An image's bytes and type, or null when the campaign holds no such image. */
  async get(campaignId: string, src: string): Promise<{ type: string; body: Uint8Array<ArrayBuffer> } | null> {
    if (!IMAGE_SRC.test(src)) return null;
    if (src.startsWith("pack:")) {
      const file = join(this.packDir, `${src.slice(5)}.webp`);
      return existsSync(file) ? { type: "image/webp", body: new Uint8Array(readFileSync(file)) } : null;
    }
    const [row] = await this.db.query<{ type: string; bytes: Uint8Array }>("select type, bytes from campaign_images where campaign_id = $1 and id = $2", [campaignId, src.slice(7)]);
    return row ? { type: row.type, body: new Uint8Array(row.bytes) } : null;
  }
}
