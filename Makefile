# Gradebreaker — Build Pipeline
# Layout: book/ (chapters, assets, pipeline, kit), rules/ (data, templates,
# fixtures), tools/ (engine, lint, table renderer), app/ (the companion app).
# Run `make` (or `make all`) to build PDF + EPUB.
# Run `make pdf` or `make epub` to build just one.
# Each invocation copies the build to a timestamped filename.
# Run `make clean` to wipe build artifacts.

PROJECT     := litrpg-rpg
BUILD_DIR   := build
BOOK        := book
PIPELINE    := $(BOOK)/pipeline
TEMPLATE    := $(PIPELINE)/eisvogel.latex
METADATA    := $(PIPELINE)/metadata.yaml
PREAMBLE    := $(PIPELINE)/preamble.tex
LUAFILTER   := $(PIPELINE)/divs-to-environments.lua

# Chapter files under $(BOOK), in canonical order. 99-to-do is excluded by design.
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
COVER_BASE   := $(BOOK)/assets/art/cover.png
COVER_ARGS   :=
COVER_TITLED := $(BUILD_DIR)/cover_titled.png

# Art masters live under book/assets/art/ at MASTER_PPI of the 7-inch trim
# width (a full-page master is 2100 px wide; the cover alone is 3150). A build resamples them into
# $(ART_DIR) at ART_PPI and Pandoc reads that tree first, so `make` gives a
# reading-size book and `make pdf ART_PPI=300` a print-resolution one.
ART_PPI    ?= 150
MASTER_PPI := 300
ART_SRC    := $(BOOK)/assets/art
ART_DIR    := $(BUILD_DIR)/art-$(ART_PPI)
ART_STAMP  := $(ART_DIR)/.stamp
ART_MASTERS := $(shell find $(ART_SRC) -name '*.png')
# Resolved through kpsewhich so the TeX tree's layout (Arch, Debian, ...) does not matter.
TITLE_FONT   := $(shell kpsewhich Alegreya-Black.otf)
BYLINE_FONT  := $(shell kpsewhich EBGaramond-Italic.otf)

.PHONY: all pdf epub kit art tutorial tables test check clean

all: pdf epub

# --- Table kit -------------------------------------------------------------
# The printable table kit (F-Grade character sheet front/back, GM HVE log,
# optional ledger, pregen cards) renders from HTML via headless Chromium.
# First Chromium-family binary found on PATH; override with `make CHROMIUM=...`.
CHROMIUM  ?= $(shell command -v chromium || command -v chromium-browser || command -v google-chrome || echo chromium)
KIT_SRC   := $(BOOK)/kit/table-kit.html
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
# Bake the cover block onto the cover art with tools/cover.py: the eyebrow,
# the GRADEBREAKER wordmark, the rules, and the edition bar. Both PDF and EPUB
# consume the result so the cover treatment is identical across formats.
TITLE_TEXT    := GRADEBREAKER
SUBTITLE_TEXT := The LitRPG RPG
TAGLINE_TEXT  := Power is not granted.
BYLINE_TEXT   := by Gabriel Beal

$(COVER_TITLED): $(COVER_BASE) tools/cover.py | $(BUILD_DIR)
	python3 tools/cover.py $(COVER_BASE) $@ $(COVER_ARGS)

# --- Art ---------------------------------------------------------------------
$(ART_STAMP): $(ART_MASTERS) tools/resample_art.py | $(BUILD_DIR)
	python3 tools/resample_art.py $(ART_SRC) $(ART_DIR)/assets/art --ppi $(ART_PPI) --master-ppi $(MASTER_PPI)
	@touch $@

art: $(ART_STAMP)

# --- PDF -------------------------------------------------------------------
# Per-file pre-processing for the PDF: drop the EPUB-only kit renders. Art
# placement (openers, scenes, spots, the map) is decided by image class in
# the Lua filter, from ./assets/art/... paths.
$(PDF_DIR)/%.md: $(BOOK)/%.md Makefile | $(PDF_DIR)
	sed -E -e '/kitpng/d' $< > $@

$(PDF_BASE): $(PDF_PROCESSED) $(METADATA) $(TEMPLATE) $(PREAMBLE) $(LUAFILTER) $(COVER_TITLED) $(KIT_BASE) $(ART_STAMP)
	GB_ART_DIR=$(ART_DIR) pandoc \
	  --from markdown-implicit_figures \
	  --to pdf \
	  --pdf-engine=xelatex \
	  --template=$(TEMPLATE) \
	  --metadata-file=$(METADATA) \
	  --include-in-header=$(PREAMBLE) \
	  --lua-filter=$(LUAFILTER) \
	  --resource-path=$(ART_DIR):.:$(BOOK) \
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
$(EPUB_DIR)/%.md: $(BOOK)/%.md Makefile | $(EPUB_DIR)
	cp $< $@

$(EPUB_BASE): $(EPUB_PROCESSED) $(METADATA) $(COVER_TITLED) $(KIT_PNGS) $(PIPELINE)/epub.css $(ART_STAMP)
	pandoc \
	  --from markdown-implicit_figures \
	  --to epub3 \
	  --metadata-file=$(METADATA) \
	  --resource-path=$(ART_DIR):.:$(BOOK) \
	  --top-level-division=chapter \
	  --toc \
	  --toc-depth=2 \
	  --number-sections \
	  --css $(PIPELINE)/epub.css \
	  --epub-cover-image=$(COVER_TITLED) \
	  --output $@ \
	  $(EPUB_PROCESSED)

epub: $(EPUB_BASE)
	cp $(EPUB_BASE) $(EPUB_OUT)
	@echo ""
	@echo "Built: $(EPUB_OUT)"
	@echo "Size:  $$(du -h $(EPUB_OUT) | cut -f1)"

# --- Rules data: tables, tests, lint --------------------------------------
# The book's rules tables render from rules/*.yaml; the worked examples in the
# book are fixtures the reference engine runs; the prose lint fails on retired
# values and dead cross-references. `make check` runs all three read-only.
tables:
	python3 tools/render_tables.py

test:
	python3 tools/test_rules.py
	python3 tools/lint_prose.py

check:
	python3 tools/render_tables.py --check
	python3 tools/test_rules.py
	python3 tools/lint_prose.py

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
