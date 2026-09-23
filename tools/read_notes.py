#!/usr/bin/env python3
"""Collect the annotations from a read-through copy of the book.

Read the PDF in Okular and annotate as you go (typewriter notes, pop-up notes,
highlights). Okular writes annotations into the PDF itself when the document is
saved, so keep a reading copy that no build touches:

    make reading-copy          # reading/gradebreaker-read.pdf
    make notes                 # collect what is in it

Each note is reported with its page, the numbered section it falls in, the text
it sits on, and what was typed. The section is the durable half: a rebuild moves
every page number, and headings stay put.

    python3 tools/read_notes.py                        # the reading copy
    python3 tools/read_notes.py some-other.pdf
    python3 tools/read_notes.py --raw                  # dump the annotation objects

mupdf (mutool) and poppler (pdftotext) only; nothing is installed, and the file
is read, never written. Okular's own sidecar store is read as a fallback for
annotations that were never saved into the PDF.
"""

from __future__ import annotations

import glob
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
READING = os.path.join(ROOT, "reading", "gradebreaker-read.pdf")
DOCDATA = os.path.expanduser("~/.local/share/okular/docdata")

# Annotation subtypes worth reporting. Popup is the companion window of another
# annotation and carries no text of its own.
WANTED = {"Text", "FreeText", "Highlight", "Underline", "StrikeOut", "Squiggly",
          "Square", "Circle", "Ink", "Caret", "Polygon", "PolyLine", "Stamp"}


def default_pdf() -> str:
    if os.path.exists(READING):
        return READING
    stable = os.path.join(ROOT, "build", "litrpg-rpg.pdf")
    if os.path.exists(stable):
        return stable
    builds = [p for p in glob.glob(os.path.join(ROOT, "build", "*.pdf"))
              if re.match(r"litrpg-rpg-\d{8}-\d{6}\.pdf$", os.path.basename(p))]
    if builds:
        return max(builds, key=os.path.getmtime)
    sys.exit("no PDF found; run `make reading-copy` first")


# ------------------------------------------------------------ PDF strings ---

def pdf_string(raw: str) -> str:
    """Decode a PDF string, hex <...> or literal (...)."""
    raw = raw.strip()
    if raw.startswith("<") and raw.endswith(">"):
        hexed = re.sub(r"[^0-9A-Fa-f]", "", raw[1:-1])
        if len(hexed) % 2:
            hexed += "0"
        data = bytes.fromhex(hexed)
        if data[:2] in (b"\xfe\xff",):
            return data[2:].decode("utf-16-be", "replace")
        if data[:2] in (b"\xff\xfe",):
            return data[2:].decode("utf-16-le", "replace")
        return data.decode("latin-1", "replace")
    if raw.startswith("(") and raw.endswith(")"):
        body = raw[1:-1]
        out, i = [], 0
        while i < len(body):
            c = body[i]
            if c == "\\" and i + 1 < len(body):
                nxt = body[i + 1]
                mapping = {"n": "\n", "r": "\r", "t": "\t", "b": "\b",
                           "f": "\f", "(": "(", ")": ")", "\\": "\\"}
                if nxt in mapping:
                    out.append(mapping[nxt]); i += 2; continue
                m = re.match(r"[0-7]{1,3}", body[i + 1:])
                if m:
                    out.append(chr(int(m.group(0), 8))); i += 1 + len(m.group(0)); continue
                i += 1; continue
            out.append(c); i += 1
        return "".join(out)
    return raw


# --------------------------------------------------------- PDF annotations ---

def page_objects(pdf: str) -> dict[int, int]:
    """Map a page's object number to its 1-based page number."""
    out = {}
    try:
        txt = subprocess.run(["mutool", "show", pdf, "pages"],
                             capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return out
    for m in re.finditer(r"^page (\d+) = (\d+) 0 R", txt, re.M):
        out[int(m.group(2))] = int(m.group(1))
    return out


def annotations_from_pdf(pdf: str) -> list[dict]:
    """Every annotation object in the file."""
    try:
        txt = subprocess.run(["mutool", "show", pdf, "grep"],
                             capture_output=True, text=True, check=True).stdout
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []
    pages = page_objects(pdf)
    out = []
    for line in txt.splitlines():
        if "/Type/Annot" not in line and "/Type /Annot" not in line:
            continue
        sub = re.search(r"/Subtype\s*/(\w+)", line)
        if not sub or sub.group(1) not in WANTED:
            continue
        p = re.search(r"/P\s+(\d+)\s+0\s+R", line)
        rect = re.search(r"/Rect\s*\[([-\d.\s]+)\]", line)
        contents = re.search(r"/Contents\s*(<[^>]*>|\([^)]*\))", line)
        quads = re.search(r"/QuadPoints\s*\[([-\d.\s]+)\]", line)
        when = re.search(r"/M\s*\(D:(\d{14})", line)
        out.append({
            "page": pages.get(int(p.group(1))) if p else None,
            "type": sub.group(1),
            "text": pdf_string(contents.group(1)) if contents else "",
            "rect": [float(v) for v in rect.group(1).split()] if rect else None,
            "quads": [float(v) for v in quads.group(1).split()] if quads else None,
            "when": when.group(1) if when else "",
            "raw": line.strip(),
        })
    return out


def annotations_from_docdata(pdf: str) -> list[dict]:
    """Fallback: annotations Okular kept in its sidecar store."""
    if not os.path.isdir(DOCDATA):
        return []
    want = os.path.basename(pdf)
    out = []
    for path in sorted(glob.glob(os.path.join(DOCDATA, "*.xml")), key=os.path.getmtime):
        try:
            root = ET.parse(path).getroot()
        except ET.ParseError:
            continue
        url = os.path.basename(root.get("url") or "")
        if url != want and not url.startswith("litrpg-rpg"):
            continue
        for page in root.iter("page"):
            num = page.get("number")
            if num is None:
                continue
            for ann in page.iter("annotation"):
                text = ""
                for el in ann.iter():
                    for key in ("contents", "content"):
                        if el.get(key):
                            text = el.get(key); break
                box = None
                for el in ann.iter():
                    if all(el.get(k) is not None for k in "ltrb"):
                        box = tuple(float(el.get(k)) for k in "ltrb"); break
                out.append({"page": int(num) + 1, "type": ann.get("type", "?"),
                            "text": (text or "").strip(), "box": box,
                            "rect": None, "quads": None, "when": "",
                            "raw": ET.tostring(ann, encoding="unicode").strip()})
    return out


# -------------------------------------------------------------- page text ---

def page_size(pdf: str, page: int) -> tuple[float, float]:
    xml = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), pdf, "-"],
                         capture_output=True, text=True, check=True).stdout
    m = re.search(r'<page width="([\d.]+)" height="([\d.]+)"', xml)
    return (float(m.group(1)), float(m.group(2))) if m else (504.0, 720.0)


def page_words(pdf: str, page: int) -> list[dict]:
    xml = subprocess.run(["pdftotext", "-bbox", "-f", str(page), "-l", str(page), pdf, "-"],
                         capture_output=True, text=True, check=True).stdout
    xml = re.sub(r'\sxmlns="[^"]+"', "", xml, count=1)
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    return [{"x0": float(w.get("xMin")), "y0": float(w.get("yMin")),
             "x1": float(w.get("xMax")), "y1": float(w.get("yMax")),
             "w": (w.text or "")}
            for w in root.iter("word")]


def boxes_for(note: dict, size) -> list[tuple[float, float, float, float]]:
    """Top-left-origin boxes in points. PDF space puts y at the bottom."""
    _, H = size
    if note.get("quads"):
        q, out = note["quads"], []
        for i in range(0, len(q) - 7, 8):
            xs, ys = q[i:i + 8:2], q[i + 1:i + 8:2]
            out.append((min(xs), H - max(ys), max(xs), H - min(ys)))
        return out
    if note.get("rect"):
        x0, y0, x1, y1 = note["rect"]
        return [(min(x0, x1), H - max(y0, y1), max(x0, x1), H - min(y0, y1))]
    if note.get("box"):
        W, Hh = size
        l, t, r, b = note["box"]
        return [(l * W, t * Hh, r * W, b * Hh)]
    return []


def words_in(words, box, pad=1.5) -> str:
    l, t, r, b = box
    hits = [w for w in words
            if w["x1"] > l - pad and w["x0"] < r + pad
            and w["y1"] > t - pad and w["y0"] < b + pad]
    return " ".join(w["w"] for w in sorted(hits, key=lambda w: (round(w["y0"]), w["x0"]))).strip()


def nearest_lines(words, box, span=26.0) -> str:
    """Text near a note that covers no words, for margin notes."""
    if not words:
        return ""
    _, t, _, b = box
    mid = (t + b) / 2
    near = [w for w in words if abs((w["y0"] + w["y1"]) / 2 - mid) <= span]
    return " ".join(w["w"] for w in sorted(near, key=lambda w: (round(w["y0"]), w["x0"]))).strip()


def strip_note(text: str, note: str) -> str:
    """Remove a typewriter note's own words from the text recovered under it."""
    if not text or not note:
        return text.strip()
    flat = " ".join(note.split())
    out = " ".join(text.split())
    if flat and flat in out:
        out = out.replace(flat, " ", 1)
    return " ".join(out.split()).strip()


# --------------------------------------------------------------- headings ---

def headings(pdf: str) -> dict[int, str]:
    out = {}
    try:
        txt = subprocess.run(["pdftotext", "-layout", pdf, "-"],
                             capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        return out
    # Numbered headings from --number-sections: "17 After the Gate",
    # "17.4.2 Your Own Town". Body text and lore boxes also open with digits
    # ("4 struck | By: Ensa"), so the title must start with a capital and a
    # bare chapter number must be one the book actually has.
    heading = re.compile(r"^(\d+(?:\.\d+)*)\s+([A-Z][^|]*)$")
    current = ""
    for i, chunk in enumerate(txt.split("\f"), start=1):
        for line in chunk.splitlines():
            s = line.strip()
            m = heading.match(s)
            if not m or len(s) > 80 or s.endswith(".") or ":" in s:
                continue
            # Contents entries carry dot leaders and their own page number.
            if ".  ." in s or ". ." in s or re.search(r"\.{3,}", s):
                continue
            if "." not in m.group(1) and int(m.group(1)) > 25:
                continue
            current = s
        out[i] = current
    return out


# ----------------------------------------------------------------- output ---

def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    raw = "--raw" in sys.argv
    pdf = args[0] if args else default_pdf()
    if not os.path.exists(pdf):
        sys.exit(f"no such file: {pdf}")

    notes = annotations_from_pdf(pdf)
    source = "the PDF"
    if not notes:
        notes = annotations_from_docdata(pdf)
        source = "Okular's sidecar store"
    notes = [n for n in notes if n.get("page")]
    notes.sort(key=lambda n: (n["page"], (boxes_for(n, (504, 720)) or [(0, 0, 0, 0)])[0][1]))

    if raw:
        # Silent when there is nothing, so callers can test for annotations.
        for n in notes:
            print(f"--- page {n['page']} {n['type']} ---\n{n['raw']}\n")
        return

    if not notes:
        print(f"No annotations in {os.path.basename(pdf)}.")
        print("In Okular, annotate and save (Ctrl+S) so the notes go into the file.")
        return

    heads = headings(pdf)
    print("# Read-through notes\n")
    print(f"From `{os.path.basename(pdf)}`, {len(notes)} notes, read from {source}.\n")

    cache: dict[int, tuple] = {}
    for n in notes:
        p = n["page"]
        if p not in cache:
            cache[p] = (page_size(pdf, p), page_words(pdf, p))
        size, words = cache[p]
        boxes = boxes_for(n, size)
        quoted = ""
        for box in boxes:
            quoted = quoted or words_in(words, box)
        if not quoted and boxes:
            quoted = nearest_lines(words, boxes[0])
        # A typewriter note is drawn into the page, so pdftotext reads the note
        # back as page text. Subtract it and keep whatever it was written beside.
        quoted = strip_note(quoted, n["text"])
        if not quoted and boxes:
            quoted = strip_note(nearest_lines(words, boxes[0], span=44.0), n["text"])
        section = heads.get(p, "")
        print(f"## p. {p}" + (f" — {section}" if section else "") + f"  ({n['type']})")
        if quoted:
            q = quoted if len(quoted) <= 400 else quoted[:400] + " ..."
            print(f"\n> {q}\n")
        print((n["text"] or "*(no text typed)*").strip() + "\n")


if __name__ == "__main__":
    main()
