# LitRPG: RPG — Build Pipeline
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
  05-quick-reference.md \
  10-core-mechanics.md \
  15-character-creation.md \
  20-principles.md \
  25-cultivation.md \
  30-breakthroughs.md \
  35-stable-abilities.md \
  40-titles.md \
  45-system-ai.md \
  50-hidden-vector-engine.md \
  55-quests.md \
  60-bestiary.md \
  65-items.md \
  70-tutorial.md

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
TITLE_FONT   := /usr/share/texmf-dist/fonts/truetype/ndiscovered/cinzel/CinzelDecorative-Black.ttf
BYLINE_FONT  := /usr/share/texmf-dist/fonts/opentype/public/ebgaramond/EBGaramond-Italic.otf

.PHONY: all pdf epub clean

all: pdf epub

# --- Cover with baked title -----------------------------------------------
# Bake "LITRPG: RPG" (top, Cinzel Decorative Black) and "by Gabriel Beal"
# (bottom-right, EB Garamond Italic) onto the cover image. Both PDF and
# EPUB consume the result so the cover treatment is identical across formats.
$(COVER_TITLED): $(COVER_BASE) | $(BUILD_DIR)
	magick $(COVER_BASE) \
	  -gravity North \
	  -font $(TITLE_FONT) \
	  -pointsize 95 \
	  -stroke black -strokewidth 3 -fill white \
	  -annotate +0+45 "LITRPG: RPG" \
	  -gravity SouthEast \
	  -font $(BYLINE_FONT) \
	  -pointsize 26 \
	  -stroke none -fill white \
	  -annotate +30+30 "by Gabriel Beal" \
	  $@

# --- PDF -------------------------------------------------------------------
# Per-file pre-processing: convert chapter art image syntax into a full-page
# bleed-edge LaTeX command. Pattern: ![alt](./assets/foo.png) -> \fullpageart{./assets/foo.png}
$(PDF_DIR)/%.md: %.md | $(PDF_DIR)
	sed -E \
	  -e 's|^!\[[^]]*\]\(\./assets/([^)]+\.png)\)[[:space:]]*$$|\\fullpageart{./assets/\1}|' \
	  $< > $@

$(PDF_BASE): $(PDF_PROCESSED) $(METADATA) $(TEMPLATE) $(PREAMBLE) $(LUAFILTER) $(COVER_TITLED)
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

$(EPUB_BASE): $(EPUB_PROCESSED) $(METADATA) $(COVER_TITLED)
	pandoc \
	  --from markdown \
	  --to epub3 \
	  --metadata-file=$(METADATA) \
	  --resource-path=. \
	  --top-level-division=chapter \
	  --toc \
	  --toc-depth=2 \
	  --number-sections \
	  --epub-cover-image=$(COVER_TITLED) \
	  --output $@ \
	  $(EPUB_PROCESSED)

epub: $(EPUB_BASE)
	cp $(EPUB_BASE) $(EPUB_OUT)
	@echo ""
	@echo "Built: $(EPUB_OUT)"
	@echo "Size:  $$(du -h $(EPUB_OUT) | cut -f1)"

# --- Directories & clean ---------------------------------------------------
$(PDF_DIR) $(EPUB_DIR):
	mkdir -p $@

clean:
	rm -rf $(BUILD_DIR)
