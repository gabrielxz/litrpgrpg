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
SOURCES := \
  00-quick-reference.md \
  01-core-mechanics.md \
  02-proficiencies-and-skills.md \
  02a-character-creation.md \
  03-principles.md \
  04-cultivation.md \
  05-system-ai.md \
  06-hidden-vector-engine.md \
  07-tutorial.md \
  08-breakthroughs.md \
  09-bestiary.md \
  10-stable-abilities.md \
  11-items.md \
  12-titles.md \
  13-quests.md

# Pre-processed copies in build/ have the per-file boilerplate H1 stripped
# so each file's H2 ("Quick Reference: The Clash", etc.) becomes the chapter
# title after --shift-heading-level-by=-1.
PROCESSED := $(addprefix $(BUILD_DIR)/, $(SOURCES))

PDF := $(BUILD_DIR)/$(PROJECT).pdf

.PHONY: pdf clean

pdf: $(PDF)

# Per-file pre-processing:
#   1. Strip the boilerplate "# LitRPG: RPG" line.
#   2. Convert chapter art image syntax into a full-page bleed-edge LaTeX command.
#      Pattern: ![alt](./assets/foo.png)  ->  \fullpageart{./assets/foo.png}
$(BUILD_DIR)/%.md: %.md | $(BUILD_DIR)
	sed -E \
	  -e '/^# LitRPG: RPG[[:space:]]*$$/d' \
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
	  --shift-heading-level-by=-1 \
	  --toc \
	  --toc-depth=2 \
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
