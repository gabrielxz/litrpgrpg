# Clave: segmented production set v1

Prepared September 22, 2026 from Gabriel's angular cyan reference. This is a proposed production refinement, not an approval or a replacement of the game's separate compass emblem.

## Deliverables

- `clave-cyan-blueblack.png`: flat cyan on blue-black, 2048 x 2048.
- `clave-cyan-transparent.png`: the identical cyan mark on a genuinely transparent canvas, 2048 x 2048. Retain the alpha channel; the foreground is cyan and should not itself be keyed away.
- `clave-ink-bone.png`: the identical mark in dark ink on bone ivory, 2048 x 2048.
- Matching `.svg` files: editable, resolution-independent masters with precisely the same geometry.
- `clave-size-proof.pdf`: A4 landscape sheet showing a 90 mm full view, plus 25 mm and 8 mm mark widths for each color treatment. Print at 100% / Actual Size. The calibration line should measure 25 mm. Screen zoom is not a physical-size proof.
- `clave-size-proof.png`: screen preview of that sheet.

## Geometry and color

The long rising diagonal, two open hooks, short vertical crossing bar, orientation and proportions were reconstructed from the supplied angular reference using straight vector edges. Six narrow separation cuts suggest assembled glyph pieces. No cut crosses the central bar. There are no rings, frames, added symbols, text or decorative ticks in the mark assets.

The visible mark is 60% of the square's width and approximately 71.7% of its height. Physical mark sizes in the proof refer to the visible silhouette, not the full square canvas. All variants use the same shapes, placement and scale.

Production colors for this set: cyan `#42E9F5`, blue-black `#101B22`, ink `#16222B`, bone `#F0E7D5`. These are explicit export choices, not a change to the Art Bible's open canonical palette. The foreground and background fills are constant. PNG antialiasing exists only at vector edges, with no glow, texture, lighting or gradient.

At 8 mm the hook openings and bar remain distinguishable in the rendered proof; separation gaps become secondary. Physical print behavior depends on the output process, so the actual-size PDF is supplied for inspection before placement.

## Provenance

The built-in image generator produced the initial segmented draft. It returned a 1254 x 1254 raster with slight color variation. To satisfy the flat-color, common-geometry and 2048-pixel requirements, the final assets were constructed as a straight-edged SVG master using the supplied reference geometry and the draft's segmentation direction. The PNGs are direct vector renders, not enlargements of that raster. The central bar was kept connected in the final master.

The generation prompt and these production notes are included. `clave-geometry.json` records the coordinate geometry; `verification.json` records dimensions, alpha bounds and the verified single opaque foreground color.
