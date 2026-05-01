# LitRPG: RPG — Build Pipeline
# Run `make` to build the PDF. Run `make clean` to wipe build artifacts.

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

PROCESSED := $(addprefix $(BUILD_DIR)/, $(SOURCES))

PDF := $(BUILD_DIR)/$(PROJECT).pdf

.PHONY: pdf clean

pdf: $(PDF)

# Per-file pre-processing: convert chapter art image syntax into a full-page
# bleed-edge LaTeX command. Pattern: ![alt](./assets/foo.png) -> \fullpageart{./assets/foo.png}
$(BUILD_DIR)/%.md: %.md | $(BUILD_DIR)
	sed -E \
	  -e 's|^!\[[^]]*\]\(\./assets/([^)]+\.png)\)[[:space:]]*$$|\\fullpageart{./assets/\1}|' \
	  $< > $@

$(PDF): $(PROCESSED) $(METADATA) $(TEMPLATE) $(PREAMBLE) $(LUAFILTER)
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
	  $(PROCESSED)
	@echo ""
	@echo "Built: $(PDF)"
	@echo "Size:  $$(du -h $(PDF) | cut -f1)"

$(BUILD_DIR):
	mkdir -p $@

clean:
	rm -rf $(BUILD_DIR)
