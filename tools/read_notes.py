#!/usr/bin/env python3
"""Collect Okular annotations from a build of the book into a notes file.

Read the PDF in Okular and annotate as you go (pop-up notes, highlights,
inline notes). Okular keeps the annotations in its own per-document store
under ~/.local/share/okular/docdata/, so nothing has to be exported and the
PDF itself is never modified.

    python3 tools/read_notes.py                       # newest build
    python3 tools/read_notes.py build/litrpg-rpg.pdf
    python3 tools/read_notes.py --raw                 # dump the annotation XML

Each note is reported with its page, the chapter and section it falls in, the
text it sits on, and whatever was typed into it. The section matters more than
the page: a rebuild moves every page number, and headings stay put.

Only poppler (pdftotext) and the standard library are used.
"""

from __future__ import annotations

import glob
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCDATA = os.path.expanduser("~/.local/share/okular/docdata")


# ------------------------------------------------------------------ input ---

def newest_build() -> str:
    """The most recent full-book build; the tutorial and kit cuts are skipped."""
    pattern = os.path.join(ROOT, "build", "litrpg-rpg-[0-9]" * 1 + "*.pdf")
    builds = [p for p in glob.glob(pattern)
              if re.match(r"litrpg-rpg-\d{8}-\d{6}\.pdf$", os.path.basename(p))]
    stable = os.path.join(ROOT, "build", "litrpg-rpg.pdf")
    # The stable path is the one Okular is usually pointed at, and the
    # timestamped file beside it is a copy of the same build.
    if os.path.exists(stable):
        return stable
    if builds:
        return max(builds, key=os.path.getmtime)
    sys.exit("no build found in build/; run `make pdf` first")


def docdata_for(pdf: str) -> list[str]:
    """Okular's store files for this document, newest last.

    Okular keys on file size and name, so a rebuilt PDF gets a new store and
    the old ones linger. Annotations may sit in any of them; the caller reads
    them all and keeps whichever hold notes.
    """
    if not os.path.isdir(DOCDATA):
        return []
    want = os.path.basename(pdf)
    hits = []
    for path in glob.glob(os.path.join(DOCDATA, "*.xml")):
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        url = root.get("url") or ""
        # Match the exact file, or any build of the same book.
        if os.path.basename(url) == want or re.match(r"litrpg-rpg.*\.pdf$", os.path.basename(url)):
            hits.append((os.path.getmtime(path), path))
    return [p for _, p in sorted(hits)]


# ------------------------------------------------------------ annotations ---

def _floats(el: ET.Element, *names) -> list[float] | None:
    """Read a boundary from attributes or a child element, whatever Okular wrote."""
    for source in (el, *el):
        vals = [source.get(n) for n in names]
        if all(v is not None for v in vals):
            try:
                return [float(v) for v in vals]
            except ValueError:
                pass
    return None


def boundary(ann: ET.Element) -> tuple[float, float, float, float] | None:
    """Normalised (left, top, right, bottom) in 0..1 page coordinates."""
    for el in ann.iter():
        got = _floats(el, "l", "t", "r", "b")
        if got:
            return tuple(got)
    return None


def note_text(ann: ET.Element) -> str:
    """Whatever the reader typed, from wherever Okular put it."""
    for key in ("contents", "content", "text"):
        v = ann.get(key)
        if v and v.strip():
            return v.strip()
    for el in ann.iter():
        for key in ("contents", "content"):
            v = el.get(key)
            if v and v.strip():
                return v.strip()
        if el.tag in ("text", "contents") and (el.text or "").strip():
            return el.text.strip()
    return ""


def annotations(paths: list[str]) -> list[dict]:
    """Every annotation in every matching store, de-duplicated."""
    out, seen = [], set()
    for path in paths:
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        for page in root.iter("page"):
            num = page.get("number")
            if num is None:
                continue
            for ann in page.iter("annotation"):
                rec = {
                    "page": int(num) + 1,        # Okular counts from zero
                    "type": ann.get("type", "?"),
                    "text": note_text(ann),
                    "box": boundary(ann),
                    "xml": ET.tostring(ann, encoding="unicode"),
                }
                key = (rec["page"], rec["type"], rec["text"], rec["box"])
                if key not in seen:
                    seen.add(key)
                    out.append(rec)
    return sorted(out, key=lambda r: (r["page"], (r["box"] or (0, 0))[1]))


# -------------------------------------------------------------- page text ---

def page_words(pdf: str, first: int, last: int) -> dict[int, list[dict]]:
    """Word boxes per page, from poppler."""
    xml = subprocess.run(
        ["pdftotext", "-bbox", "-f", str(first), "-l", str(last), pdf, "-"],
        capture_output=True, text=True, check=True).stdout
    # pdftotext emits XHTML with a namespace; strip it for simple traversal.
    xml = re.sub(r'\sxmlns="[^"]+"', "", xml, count=1)
    root = ET.fromstring(xml)
    pages = {}
    for i, page in enumerate(root.iter("page"), start=first):
        pages[i] = [{
            "x0": float(w.get("xMin")), "y0": float(w.get("yMin")),
            "x1": float(w.get("xMax")), "y1": float(w.get("yMax")),
            "w": (w.text or ""),
        } for w in page.iter("word")]
    return pages


def page_size(pdf: str, page: int) -> tuple[float, float]:
    xml = subprocess.run(
        ["pdftotext", "-bbox", "-f", str(page), "-l", str(page), pdf, "-"],
        capture_output=True, text=True, check=True).stdout
    m = re.search(r'<page width="([\d.]+)" height="([\d.]+)"', xml)
    return (float(m.group(1)), float(m.group(2))) if m else (504.0, 720.0)


def text_under(words: list[dict], box, size, pad: float = 2.0) -> str:
    """The words a normalised box covers."""
    if not box or not words:
        return ""
    W, H = size
    l, t, r, b = box[0] * W, box[1] * H, box[2] * W, box[3] * H
    hits = [w["w"] for w in words
            if w["x1"] > l - pad and w["x0"] < r + pad
            and w["y1"] > t - pad and w["y0"] < b + pad]
    return " ".join(hits).strip()


def line_at(words: list[dict], box, size) -> str:
    """The line a point-shaped note sits on, for notes with no selection."""
    if not box or not words:
        return ""
    W, H = size
    y = box[1] * H
    near = [w for w in words if w["y0"] - 6 <= y <= w["y1"] + 6]
    return " ".join(w["w"] for w in sorted(near, key=lambda w: w["x0"])).strip()


# --------------------------------------------------------------- headings ---

def headings(pdf: str, pages: int) -> dict[int, str]:
    """The chapter and section in force on each page, read from the outline."""
    out = {}
    try:
        txt = subprocess.run(["pdftotext", "-layout", pdf, "-"],
                             capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        return out
    # Numbered headings from --number-sections: "17 After the Gate",
    # "17.4.2 Your Own Town". Body text and the lore boxes also open with
    # digits ("4 struck | By: Ensa"), so the title must start with a capital
    # and a bare chapter number must be one the book actually has.
    heading = re.compile(r"^(\d+(?:\.\d+)*)\s+([A-Z][^|]*)$")
    current = ""
    for i, chunk in enumerate(txt.split("\f"), start=1):
        for line in chunk.splitlines():
            s = line.strip()
            m = heading.match(s)
            if not m or len(s) > 80 or s.endswith(".") or ":" in s:
                continue
            number = m.group(1)
            if "." not in number and int(number) > 25:
                continue
            current = s
        out[i] = current
    return out


# ------------------------------------------------------------------ output ---

def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    raw = "--raw" in sys.argv
    pdf = args[0] if args else newest_build()
    if not os.path.exists(pdf):
        sys.exit(f"no such file: {pdf}")

    stores = docdata_for(pdf)
    notes = annotations(stores)
    if not notes:
        print(f"No annotations found for {os.path.basename(pdf)}.")
        print(f"Okular stores checked: {len(stores)}")
        print("Open the PDF in Okular, add a note (F6 for the tools), and run this again.")
        return

    if raw:
        for n in notes:
            print(f"--- page {n['page']} ---")
            print(n["xml"])
        return

    heads = headings(pdf, max(n["page"] for n in notes))
    print(f"# Read-through notes\n")
    print(f"From `{os.path.basename(pdf)}`, {len(notes)} notes.\n")

    for n in notes:
        p = n["page"]
        size = page_size(pdf, p)
        words = page_words(pdf, p, p).get(p, [])
        quoted = text_under(words, n["box"], size) or line_at(words, n["box"], size)
        section = heads.get(p, "")
        print(f"## p. {p}" + (f" — {section}" if section else ""))
        if quoted:
            q = quoted if len(quoted) < 400 else quoted[:400] + " ..."
            print(f"\n> {q}\n")
        if n["text"]:
            print(f"**{n['type']}:** {n['text']}\n")
        else:
            print(f"*({n['type']}, no text typed)*\n")


if __name__ == "__main__":
    main()
