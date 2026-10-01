/**
 * The guide's Markdown: the small subset its pages are written in (headings to ###, paragraphs,
 * one level of bullet or numbered list, a note paragraph starting "> ", a screenshot on a line of
 * its own, and inline bold, italic, code, and links). Anything else shows as plain text.
 */
import { Fragment, type ReactNode } from "react";

export type Block =
  | { kind: "h1" | "h2" | "h3" | "p" | "note"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "shot"; caption: string; src: string };

export function parse(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (para.length) {
      const text = para.join(" ");
      blocks.push(text.startsWith("> ") ? { kind: "note", text: text.slice(2) } : { kind: "p", text });
    }
    para = [];
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    const shot = /^!\[(.*)\]\(([^)\s]+)\)$/.exec(line);
    const item = /^(?:(- )|(\d+)\. )(.+)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      blocks.push({ kind: `h${heading[1]!.length}` as "h1" | "h2" | "h3", text: heading[2]! });
    } else if (shot) {
      flush();
      blocks.push({ kind: "shot", caption: shot[1]!, src: shot[2]! });
    } else if (item) {
      const kind = item[1] ? "ul" : "ol";
      if (para.length || (list && list.kind !== kind)) flush();
      list ??= { kind, items: [] };
      list.items.push(item[3]!);
    } else if (list) list.items[list.items.length - 1] += ` ${line}`;
    else para.push(line);
  }
  flush();
  return blocks;
}

/** A screenshot's dark-theme capture: `gm-party.webp` is `gm-party-dark.webp`. */
export const darkOf = (src: string) => src.replace(/(\.[a-z]+)$/, "-dark$1");

/** Where a link goes: `guide:<id>` is another page of the guide. */
export const hrefOf = (target: string) => (target.startsWith("guide:") ? `/guide/${target.slice(6)}` : target);

/** Inline Markdown: **bold**, *italic*, `code`, and [text](target). */
export function inline(text: string, onLink?: (href: string) => void): ReactNode {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((\S+?)\)/g;
  let at = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    const key = n++;
    if (m[1] !== undefined) out.push(<b key={key}>{inline(m[1], onLink)}</b>);
    else if (m[2] !== undefined) out.push(<i key={key}>{inline(m[2], onLink)}</i>);
    else if (m[3] !== undefined) out.push(<code key={key}>{m[3]}</code>);
    else {
      const href = hrefOf(m[5]!);
      const internal = href.startsWith("/guide/");
      out.push(
        <a
          key={key}
          href={href}
          {...(internal ? {} : { target: "_blank", rel: "noreferrer" })}
          onClick={(e) => {
            if (!internal || !onLink || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onLink(href);
          }}
        >
          {inline(m[4]!, onLink)}
        </a>,
      );
    }
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out.length === 1 ? out[0] : <Fragment>{out}</Fragment>;
}

export function Markdown({ blocks, shotBase, onLink }: { blocks: Block[]; shotBase: string; onLink?: (href: string) => void }) {
  return (
    <>
      {blocks.map((b, i) => {
        const t = (s: string) => inline(s, onLink);
        switch (b.kind) {
          case "h1":
            return <h1 key={i}>{t(b.text)}</h1>;
          case "h2":
            return <h2 key={i}>{t(b.text)}</h2>;
          case "h3":
            return <h3 key={i}>{t(b.text)}</h3>;
          case "p":
            return <p key={i}>{t(b.text)}</p>;
          case "note":
            return (
              <p key={i} className="guide__note">
                {t(b.text)}
              </p>
            );
          case "ul":
          case "ol": {
            const L = b.kind;
            return (
              <L key={i}>
                {b.items.map((x, j) => (
                  <li key={j}>{t(x)}</li>
                ))}
              </L>
            );
          }
          case "shot":
            return (
              <figure key={i} className="guide__shot">
                <a href={`${shotBase}${b.src}`} target="_blank" rel="noreferrer">
                  {/* The dark theme's capture for a reader in dark mode, as the guide itself follows the setting. */}
                  <picture>
                    <source srcSet={`${shotBase}${darkOf(b.src)}`} media="(prefers-color-scheme: dark)" />
                    <img src={`${shotBase}${b.src}`} alt={b.caption} loading="lazy" />
                  </picture>
                </a>
                <figcaption>{t(b.caption)}</figcaption>
              </figure>
            );
        }
      })}
    </>
  );
}
