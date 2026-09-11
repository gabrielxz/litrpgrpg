# Gradebreaker — Build Pipeline
# Run `make` (or `make all`) to build PDF + EPUB.
# Run `make pdf` or `make epub` to build just one.
# Each invocation copies the build to a timestamped filename.
# Run `make clean` to wipe build artifacts.

PROJECT     := litrpg-rpg
BUILD_DIR   := build
PIPELINE    := pipeline
TEMPLATE    := $(PIPELINE)/eisvogel.latex
METADATA    := $(PIPELINE)/metadata.yaml
PREAMBLE    := $(PIPELINE)/preamble.tex
LUAFILTER   := $(PIPELINE)/divs-to-environments.lua

# Source files in canonical order. 99-to-do is excluded by design.
# Numeric prefixes use a gap-of-5 scheme to allow new chapters to slot in
# between existing ones without renumbering.
SOURCES := \
  00-introduction.md \
  10-core-mechanics.md \
  15-character-creation.md \
  17-progression.md \
  20-principles.md \
  25-cultivation.md \
  30-breakthroughs.md \
  40-titles.md \
  45-system-ai.md \
  50-hidden-vector-engine.md \
  55-quests.md \
  57-what-can-be-seen.md \
  60-bestiary.md \
  65-items.md \
  70-tutorial.md \
  75-quick-reference.md \
  80-table-kit.md

# Per-invocation timestamp (YYYYMMDD-HHMMSS) for the stamped output filenames.
# `:=` evaluates once, so PDF and EPUB share the same timestamp on a given build.
TIMESTAMP := $(shell date +%Y%m%d-%H%M%S)

PDF_DIR        := $(BUILD_DIR)/pdf
EPUB_DIR       := $(BUILD_DIR)/epub
PDF_PROCESSED  := $(addprefix $(PDF_DIR)/,  $(SOURCES))
EPUB_PROCESSED := $(addprefix $(EPUB_DIR)/, $(SOURCES))

PDF_BASE   := $(BUILD_DIR)/$(PROJECT).pdf
EPUB_BASE  := $(BUILD_DIR)/$(PROJECT).epub
PDF_OUT    := $(BUILD_DIR)/$(PROJECT)-$(TIMESTAMP).pdf
EPUB_OUT   := $(BUILD_DIR)/$(PROJECT)-$(TIMESTAMP).epub

# Cover image with title and byline baked in via ImageMagick.
# Used by BOTH the PDF titlepage-background and the EPUB --epub-cover-image,
# so the cover treatment is identical across formats. Pandoc's EPUB writer
# does not overlay text on the cover image, hence the bake.
COVER_BASE   := assets/cover.png
COVER_TITLED := $(BUILD_DIR)/cover_titled.png
# Resolved through kpsewhich so the TeX tree's layout (Arch, Debian, ...) does not matter.
TITLE_FONT   := $(shell kpsewhich CinzelDecorative-Black.ttf)
BYLINE_FONT  := $(shell kpsewhich EBGaramond-Italic.otf)

.PHONY: all pdf epub kit tutorial clean

all: pdf epub

# --- Table kit -------------------------------------------------------------
# The printable table kit (F-Grade character sheet front/back, GM HVE log,
# optional ledger, pregen cards) renders from HTML via headless Chromium.
# First Chromium-family binary found on PATH; override with `make CHROMIUM=...`.
CHROMIUM  ?= $(shell command -v chromium || command -v chromium-browser || command -v google-chrome || echo chromium)
KIT_SRC   := kit/table-kit.html
KIT_BASE  := $(BUILD_DIR)/$(PROJECT)-table-kit.pdf
KIT_OUT   := $(BUILD_DIR)/$(PROJECT)-table-kit-$(TIMESTAMP).pdf

KIT_PNG_DIR := $(BUILD_DIR)/kitpng
KIT_PNGS    := $(KIT_PNG_DIR)/kit-1.png

$(KIT_BASE): $(KIT_SRC)
	mkdir -p $(BUILD_DIR)
	$(CHROMIUM) --headless --disable-gpu --no-pdf-header-footer \
	  --print-to-pdf=$@ $(KIT_SRC)

# Kit pages rendered to PNG for the EPUB's Table Kit appendix.
$(KIT_PNGS): $(KIT_BASE)
	mkdir -p $(KIT_PNG_DIR)
	pdftoppm -png -r 150 $(KIT_BASE) $(KIT_PNG_DIR)/kit

kit: $(KIT_BASE)
	cp $(KIT_BASE) $(KIT_OUT)
	@echo ""
	@echo "Built: $(KIT_OUT)"
	@echo "Size:  $$(du -h $(KIT_OUT) | cut -f1)"

# --- Cover with baked title -----------------------------------------------
# Bake the cover block onto the cover image: title (top, Cinzel Decorative
# Black), subtitle beneath it and tagline bottom-left (EB Garamond Italic),
# byline bottom-right. Both PDF and EPUB consume the result so the cover
# treatment is identical across formats.
TITLE_TEXT    := GRADEBREAKER
SUBTITLE_TEXT := The LitRPG RPG
TAGLINE_TEXT  := Power is not granted.
BYLINE_TEXT   := by Gabriel Beal

$(COVER_TITLED): $(COVER_BASE) | $(BUILD_DIR)
	magick $(COVER_BASE) \
	  -gravity North \
	  -font $(TITLE_FONT) \
	  -pointsize 72 \
	  -stroke black -strokewidth 3 -fill white \
	  -annotate +0+40 "$(TITLE_TEXT)" \
	  -font $(BYLINE_FONT) \
	  -pointsize 40 \
	  -stroke black -strokewidth 5 -fill black \
	  -annotate +0+128 "$(SUBTITLE_TEXT)" \
	  -stroke none -fill white \
	  -annotate +0+128 "$(SUBTITLE_TEXT)" \
	  -gravity SouthWest \
	  -pointsize 28 \
	  -stroke black -strokewidth 4 -fill black \
	  -annotate +30+30 "$(TAGLINE_TEXT)" \
	  -stroke none -fill white \
	  -annotate +30+30 "$(TAGLINE_TEXT)" \
	  -gravity SouthEast \
	  -pointsize 26 \
	  -stroke black -strokewidth 3 -fill black \
	  -annotate +30+30 "$(BYLINE_TEXT)" \
	  -stroke none -fill white \
	  -annotate +30+30 "$(BYLINE_TEXT)" \
	  $@

# --- PDF -------------------------------------------------------------------
# Per-file pre-processing: convert chapter art image syntax into a full-page
# bleed-edge LaTeX command. Pattern: ![alt](./assets/foo.png) -> \fullpageart{./assets/foo.png}
$(PDF_DIR)/%.md: %.md | $(PDF_DIR)
	sed -E \
	  -e 's|^!\[[^]]*\]\(\./assets/([^)]+\.png)\)[[:space:]]*$$|\\fullpageart{./assets/\1}|' \
	  -e '/kitpng/d' \
	  $< > $@

$(PDF_BASE): $(PDF_PROCESSED) $(METADATA) $(TEMPLATE) $(PREAMBLE) $(LUAFILTER) $(COVER_TITLED) $(KIT_BASE)
	pandoc \
	  --from markdown \
	  --to pdf \
	  --pdf-engine=xelatex \
	  --template=$(TEMPLATE) \
	  --metadata-file=$(METADATA) \
	  --include-in-header=$(PREAMBLE) \
	  --lua-filter=$(LUAFILTER) \
	  --resource-path=. \
	  --top-level-division=chapter \
	  --toc \
	  --toc-depth=2 \
	  --number-sections \
	  --listings \
	  --output $@ \
	  $(PDF_PROCESSED)

pdf: $(PDF_BASE)
	cp $(PDF_BASE) $(PDF_OUT)
	@echo ""
	@echo "Built: $(PDF_OUT)"
	@echo "Size:  $$(du -h $(PDF_OUT) | cut -f1)"

# --- EPUB ------------------------------------------------------------------
# EPUB pre-processing: pass markdown through unchanged. The \fullpageart{}
# substitution is skipped so chapter art renders as a normal inline image.
# The LaTeX-only preamble and lua filter are also skipped — fenced divs
# (::: systemvoice etc.) pass through as <div class="..."> for CSS styling.
$(EPUB_DIR)/%.md: %.md | $(EPUB_DIR)
	cp $< $@

$(EPUB_BASE): $(EPUB_PROCESSED) $(METADATA) $(COVER_TITLED) $(KIT_PNGS) pipeline/epub.css
	pandoc \
	  --from markdown \
	  --to epub3 \
	  --metadata-file=$(METADATA) \
	  --resource-path=. \
	  --top-level-division=chapter \
	  --toc \
	  --toc-depth=2 \
	  --number-sections \
	  --css pipeline/epub.css \
	  --epub-cover-image=$(COVER_TITLED) \
	  --output $@ \
	  $(EPUB_PROCESSED)

epub: $(EPUB_BASE)
	cp $(EPUB_BASE) $(EPUB_OUT)
	@echo ""
	@echo "Built: $(EPUB_OUT)"
	@echo "Size:  $$(du -h $(EPUB_OUT) | cut -f1)"

# --- Tutorial-only PDF -----------------------------------------------------
# Pages from the Tutorial chapter (its art page) to the end of the book, cut
# out of the full build (mutool, which keeps shared resources shared) so page
# numbers match the full book. For the Scribe,
# which chokes on the full file.
TUTORIAL_BASE := $(BUILD_DIR)/$(PROJECT)-tutorial.pdf
TUTORIAL_OUT  := $(BUILD_DIR)/$(PROJECT)-tutorial-$(TIMESTAMP).pdf

tutorial: $(PDF_BASE)
	@N=$$(pdfinfo $(PDF_BASE) | awk '/^Pages/{print $$2}'); \
	START=""; \
	for i in $$(seq 1 $$N); do \
	  if pdftotext -f $$i -l $$i -layout $(PDF_BASE) - | grep -Eq "^ *[0-9]+ +The Tutorial: Integration Protocol *$$"; then START=$$((i-1)); break; fi; \
	done; \
	test -n "$$START" || { echo "Tutorial heading not found"; exit 1; }; \
	mutool merge -o $(TUTORIAL_BASE) $(PDF_BASE) $$START-$$N; \
	cp $(TUTORIAL_BASE) $(TUTORIAL_OUT); \
	echo ""; echo "Built: $(TUTORIAL_OUT) (pages $$START to $$N of the full book)"; \
	echo "Size:  $$(du -h $(TUTORIAL_OUT) | cut -f1)"

# --- Directories & clean ---------------------------------------------------
$(PDF_DIR) $(EPUB_DIR):
	mkdir -p $@

clean:
	rm -rf $(BUILD_DIR)
