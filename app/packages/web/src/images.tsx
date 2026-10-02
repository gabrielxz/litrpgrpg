/**
 * Images and handouts (app/DESIGN.md, M1, "Images and handouts"): the file behind a `src`, fetched
 * with the sign-in header the server asks for, the upload the GM makes from Prep, and the view
 * that opens one full-screen.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { currentToken } from "./api.ts";
import { Icon } from "./ui.tsx";

/** Object URLs by campaign and src, kept for the page's life so a thumbnail and its full view share one fetch. */
const cache = new Map<string, Promise<string>>();

function load(campaignId: string, src: string): Promise<string> {
  const key = `${campaignId} ${src}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const token = await currentToken();
      const res = await fetch(`/api/campaigns/${campaignId}/image?src=${encodeURIComponent(src)}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`the image could not be loaded (${res.status})`);
      return URL.createObjectURL(await res.blob());
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** The URL to show an image from, once it has loaded. */
export function useImage(campaignId: string, src: string): { url: string | null; error: string | null } {
  const [state, setState] = useState<{ url: string | null; error: string | null }>({ url: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ url: null, error: null });
    load(campaignId, src).then(
      (url) => live && setState({ url, error: null }),
      (e: Error) => live && setState({ url: null, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [campaignId, src]);
  return state;
}

/** The longest side an upload keeps: enough for a full screen, small enough to send quickly. */
const LONGEST = 1600;

/** Shrinks a picked file to WebP in the browser and uploads it; returns its `src`. */
export async function uploadImage(campaignId: string, file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONGEST / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("the image could not be read"))), "image/webp", 0.85));
  const token = await currentToken();
  const res = await fetch(`/api/campaigns/${campaignId}/images`, {
    method: "POST",
    headers: { "content-type": blob.type, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: blob,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `the upload failed (${res.status})`);
  return (data as { src: string }).src;
}

/** An image as a thumbnail or inline picture; a placeholder while it loads. */
export function Picture({ campaignId, src, alt, className }: { campaignId: string; src: string; alt: string; className?: string }) {
  const { url, error } = useImage(campaignId, src);
  if (error) return <span className={`picture picture--missing ${className ?? ""}`}>{error}</span>;
  return url ? <img className={`picture ${className ?? ""}`} src={url} alt={alt} /> : <span className={`picture picture--loading ${className ?? ""}`} aria-label="Loading the image" />;
}

/** The image full-screen, with its title and caption; Escape or a click closes it. */
export function ImageView({ campaignId, src, title, caption, onClose }: { campaignId: string; src: string; title: string; caption?: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div className="image-view" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <figure className="image-view__figure" onClick={(e) => e.stopPropagation()}>
        <Picture campaignId={campaignId} src={src} alt={caption ?? title} className="image-view__img" />
        <figcaption className="image-view__caption">
          <b className="world">{title}</b>
          {caption && <span>{caption}</span>}
        </figcaption>
      </figure>
      <button className="btn btn--sm image-view__close" type="button" onClick={onClose}>
        <Icon name="close" />
        Close
      </button>
    </div>,
    document.body,
  );
}
