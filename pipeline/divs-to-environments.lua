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
-- Recognized classes (defined in pipeline/preamble.tex):
--   * systemvoice   — in-fiction System messages (dark, cyan-ruled)
--   * statblock     — monster / character stat blocks (gray, top-ruled)
--   * questcard     — Quest log / Mandate / Personal Opportunity entries
--
-- Anything else passes through untouched.

local recognized = {
  systemvoice = true,
  statblock   = true,
  questcard   = true,
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
