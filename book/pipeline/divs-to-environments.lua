-- Pandoc Lua filter: convert markdown fenced divs into LaTeX environments.
--
-- Usage in markdown:
--     ::: systemvoice
--     *Consciousness anchored. Native world: Earth.*
--     :::
--
-- Maps to:
--     \begin{systemvoice}
--     \textit{Consciousness anchored. Native world: Earth.}
--     \end{systemvoice}
--
-- Recognized classes (defined in book/pipeline/preamble.tex):
--   * systemvoice   — in-fiction System messages (dark, cyan-ruled)
--   * statblock     — monster / character stat blocks (gray, top-ruled)
--   * questcard     — Quest log / Mandate / Personal Opportunity entries
--   * lore          — in-world cosmology, legends, color vignettes (gray, left-ruled)
--   * readaloud     — boxed narration the GM says out loud (white, titled)
--
-- Anything else passes through untouched.

local recognized = {
  systemvoice = true,
  statblock   = true,
  questcard   = true,
  lore        = true,
  readaloud   = true,
}

function Div(el)
  if FORMAT:match("latex") then
    for _, class in ipairs(el.classes) do
      if recognized[class] then
        return {
          pandoc.RawBlock("latex", "\\begin{" .. class .. "}"),
          el,
          pandoc.RawBlock("latex", "\\end{" .. class .. "}"),
        }
      end
    end
  end
  return nil
end


-- Images carry a class that says how the PDF places them (the EPUB reads the
-- same classes from pipeline/epub.css):
--   * opener   — full-page bleed art at the head of a chapter
--   * fullpage — full-page art inside a chapter
--   * map      — full page, rotated to landscape
--   * scene    — text-width illustration under a heading
--   * spot     — quarter-page illustration with the text wrapped beside it
-- Paths in the chapters are ./assets/...; the PDF runs from the repo root.
local function artpath(src)
  return (src:gsub("^%./assets/", "./book/assets/"))
end

function Para(el)
  if not FORMAT:match("latex") then return nil end
  if #el.content ~= 1 or el.content[1].t ~= "Image" then return nil end
  local img = el.content[1]
  local p = artpath(img.src)
  local has = {}
  for _, c in ipairs(img.classes) do has[c] = true end
  if has.opener or has.fullpage then
    return pandoc.RawBlock("latex", "\\fullpageart{" .. p .. "}")
  elseif has.map then
    return pandoc.RawBlock("latex",
      "\\clearpage\\thispagestyle{empty}\\begin{tikzpicture}[remember picture, overlay]" ..
      "\\node[rotate=90, anchor=center, inner sep=0pt] at (current page.center) " ..
      "{\\includegraphics[width=0.94\\paperheight, height=0.94\\paperwidth, keepaspectratio]{" .. p .. "}};" ..
      "\\end{tikzpicture}\\clearpage")
  elseif has.scene then
    return pandoc.RawBlock("latex",
      "\\par\\vspace{6pt}\\noindent\\includegraphics[width=\\textwidth]{" .. p .. "}\\par\\vspace{10pt}")
  end
  return nil
end

-- A spot sits beside the blocks that follow it: the paragraphs and lists up to
-- the next heading, table, code block, or callout (at most four blocks, two for a
-- narrow portrait spot) go in a
-- text column and the image in a narrower column beside them. Anything after
-- that continues at full width.
local function is_spot(b)
  if b.t ~= "Para" or #b.content ~= 1 or b.content[1].t ~= "Image" then return false end
  for _, c in ipairs(b.content[1].classes) do if c == "spot" then return true end end
  return false
end

function Blocks(blocks)
  if not FORMAT:match("latex") then return nil end
  local out = {}
  local i = 1
  while i <= #blocks do
    local b = blocks[i]
    if is_spot(b) then
      local p = artpath(b.content[1].src)
      local narrow = false
      for _, c in ipairs(b.content[1].classes) do if c == "narrow" then narrow = true end end
      local imgw = narrow and "0.26" or "0.36"
      local txtw = narrow and "0.70" or "0.60"
      local side = {}
      local maxside = narrow and 2 or 4
      local j = i + 1
      while j <= #blocks and #side < maxside do
        local t = blocks[j].t
        if t == "Header" or t == "Table" or t == "CodeBlock" or t == "Div" or t == "RawBlock" or t == "HorizontalRule" then break end
        table.insert(side, blocks[j]); j = j + 1
      end
      if #side == 0 then
        table.insert(out, pandoc.RawBlock("latex",
          "\\begin{center}\\includegraphics[width=" .. imgw .. "\\textwidth]{" .. p .. "}\\end{center}"))
      else
        table.insert(out, pandoc.RawBlock("latex",
          "\\noindent\\begin{minipage}[t]{" .. txtw .. "\\textwidth}\\setlength{\\parskip}{6pt}"))
        for _, sb in ipairs(side) do table.insert(out, sb) end
        table.insert(out, pandoc.RawBlock("latex",
          "\\end{minipage}\\hfill\\begin{minipage}[t]{" .. imgw .. "\\textwidth}\\vspace{0pt}" ..
          "\\includegraphics[width=\\textwidth]{" .. p .. "}\\end{minipage}\\par\\vspace{10pt}"))
      end
      i = j
    else
      table.insert(out, b); i = i + 1
    end
  end
  return out
end
