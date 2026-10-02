# Shot List

Every image the book needs, in the art bible's direction. Generate in ChatGPT with `references/01-office-bone.png` plus one variant as style references only, and paste the bible's reusable instruction (section 11) ahead of the scene brief below. Palette modes and System intents are the bible's (sections 4 and 5).

## Sizes to request

The trim is 7 by 10 inches. The text block is 5.45 by 8.25 inches. There is no bleed.

| Placement | Shape | Request from ChatGPT | Print master target | Notes |
|---|---|---|---|---|
| Cover | Portrait 7:10 | Largest portrait available; 1024×1536 at minimum | 2100×3000 or larger | Leave the top 15% quiet for the eyebrow, wordmark, and rule, and the bottom 9% for the edition bar |
| Chapter opener (full page) | Portrait 7:10 | Largest portrait available; 1024×1536 at minimum | 2100×3000 | ChatGPT's portrait is 2:3; the build crops the top and bottom to 7:10, so keep faces and focal glyphs out of the outer 5% |
| Half-page scene | Landscape 3:2 | 1536×1024 or larger | 1650×1100 | Sits inside the text block under a heading |
| Spot (creature, object) | Square | 1024×1024 or larger | 1200×1200 | Quarter page, beside text; a quiet background or none |
| Portrait (NPC, pregen) | Portrait 2:3 | 1024×1536 | 1200×1800 | Cropped to square for the kit's cards, so keep the face in the middle third |
| Map | Landscape 3:2 | Largest landscape available | 3000×2000 | Full page, rotated, with room on one edge for the phase key |
| App screen | Landscape 3:2 | 1536×1024 or larger | 1536×1024 | Shown on a player's screen by the companion app; see "The Tutorial on the players' screens" |

Request the largest size the tool offers for every image and inspect the file. Upscaling adds no detail. Keep the originals; the build makes its own derivatives.

## Cover

| Image | Scene | Palette | System intent |
|---|---|---|---|
| Cover | Integration day from a rooftop or a high window: a city stopped, people in the street looking up, and one vast System diagram standing in the sky over all of it, incomplete. One person in the foreground has already turned away from it and is looking at the reader. | Bone, with time-of-day light on the city | Observation over a whole world: fine, enormous, precise | **Delivered 2026-09-17** as `book/assets/art/cover.png`, 3150×4500, the 1050×1498 original upscaled 4× with Upscayl's high-fidelity model (Real-ESRGAN) and downsampled with Lanczos. |

## Chapter openers (full page, one per chapter)

| Chapter | Scene | Palette | System intent |
|---|---|---|---|
| Introduction | A kitchen, an office, a bus: three ordinary people in one frame at the moment the voice arrives, each with the same small cyan message in front of them. Nothing else has changed yet. | Everyday color | Communication: one short ordered string, identical three times |
| Core Mechanics | Two figures mid-Clash on broken ground, weapons crossed, and the System's measuring brackets and radial ticks hung around both of them, reading the exchange. | Bone | Observation and evaluation, localized to the two bodies |
| Character Creation | A table with what someone had on them at Integration: phone, keys, a jacket, a lanyard. Sparse glyphs oriented at each object, pricing it. | Coordinated scene (a warm kitchen) | Evaluation, sparse and fine |
| Progression | A camp at night. One person's hands in the firelight as separate fragments of a diagram slide into alignment above them: the first level landing. | Bone with firelight | Recognition and advancement: fragments resolving |
| After the Gate | Halden's Court Square at dusk on Day 3: the gate standing in the old courthouse's arch, the far side showing through it under a different hour's light, the improvised customs table at the mouth of the arch, and Selan ar Nerava beyond it with a manifest beside stacked freight. The diagram overhead, enormous and visibly unfinished, with nobody looking at it. Nobody uses the courthouse's front steps; an Interceptor holds them. The full prompt, sizes, and invariants are in `briefs/after-the-gate-opener.md`. **Delivered 2026-09-23** as `book/assets/art/openers/after-the-gate.png`, 2100x3000: the 1024x1536 original upscaled 4x with Upscayl's high-fidelity model, centre-cropped to 7:10 and downsampled with Lanczos. The Aru anatomy it settles is canon in `lore/setting.md`. | Bone with time-of-day light | Recognition held short of completion |
| Classes | A man on a station bench with his head in his hands, the System's glyphs standing in the air before him: the offers at Level 10. The master is a portrait crop of a landscape generation (the man and the nearest glyph); a portrait regeneration with all three offers in frame is wanted. | Bone with cyan glyphs | Three notices, waiting |
| The Principle System | Kara with a hand flat against a boulder half again her size, and the boulder's shadow shifting as though it weighed less. One assertive mark above her hand. | Coordinated scene (stone and moss) | Recognition: a single heavy mark |
| Cultivation | A figure sitting cross-legged in a ruin, eyes closed, with pale energy leaving a dead creature nearby as slow motes and crossing the ground to them. | Bone, dark-leaning | Dormant, then organizing the flow into broad shapes |
| Grade Breakthroughs | A person standing at the lip of a Principle-rich place (a canyon, a frozen fall) with the System's diagram almost complete around them, one gap left. | Time-of-day (dawn) | Recognition at the edge of completion |
| Titles | A small, precise mark being set on a person's shoulder or collar by the System, watched by two others who can see it. | Everyday color | Recognition: one concentrated point of light |
| The System AI | The terminal reference's idea in a new scene: one person alone with a wall of glyphs, hand raised, being addressed. | Bone, dark-leaning | Communication: ordered strings, generous spacing |
| The Hidden Vector Engine | A corridor forking two ways; a person mid-step at the fork; sparse glyphs behind them, oriented at their back, unnoticed. | Bone | Observation: fine, at a distance, unregarded |
| System Quests | A cold status screen hanging in a ruined room while a person reads it with a bag over one shoulder, already deciding. | Everyday color | Instruction: legible ordered lines with a clear direction |
| What Can Be Seen | Two strangers meeting on a road; over one of them, the other sees only a thin party frame and a Grade mark, nothing more. | Time-of-day (afternoon) | Observation, deliberately partial |
| Bestiary | A creature's silhouette (the insect reference's kind of shape) seen through a doorway, with the System's classification brackets on it, and the classification visibly not fitting. | Bone, dark-leaning | Evaluation, slightly wrong |
| Items, Consumables & Volatile Artifacts | The Recycling Node pile from below: furniture, a boat, machine parts, one shard in the debris glowing. Four or five people around it, not yet reaching. | Coordinated scene (gray debris, one warm coat) | Dormant; one small active glyph on the shard |
| The Tutorial | The valley from the rim at the moment of landing: the glowing forest below, the gray hill at the bottom, the wall of light past the far rim, and one person on hands and knees in the foreground looking at it. | Time-of-day (morning haze) | Communication: "Integration complete" as one small string over the scene |
| Quick Reference | The System's reference card as pure geometry: a complete radial diagram, bands, and brackets with no people at all. | Blue-black | Instruction: the whole grammar at once, precise |
| Table Kit | A character sheet on a table with a pencil, a mug, and one cyan segment completing the sheet's frame. | Everyday color | Dormant, a single completing segment |

## The Tutorial (inside the chapter)

| Image | Placement | Scene | Palette | System intent |
|---|---|---|---|---|
| The valley map | Full page, rotated | The valley from above as a drawn map: the rim slopes, the Recycling Node at the bottom, the transit nexus beside it ringed by bright ground, the rain line to the north with the arena past it, the glowing forest east, the hanging tower west, the courthouse south, the wall of light past the far rim. The rain line is a free-standing curtain crossing the valley floor, and the arena is inside the valley beyond it. Leave one long edge quiet for the phase key. | Bone | Observation: fine radial ticks at the nexus only |
| The Void | Half page | Darkness with pressure in it: thousands of faint presences as a field, and one vast attention turning toward a single point. No body. | Blue-black | Observation, enormous and fine |
| The Arrival | Half page | A Husk Crawler dragging a ruined leg across debris toward someone who has just stood up, weaponless, three hundred yards of rubble behind them. | Bone | Evaluation on the Crawler: brackets, sparse |
| The Recycling Node | Half page | The forty-foot hill of debris with a fresh load dropping out of a gray patch of sky, and strangers standing well apart around it: work clothes, pyjamas, a wetsuit. | Everyday color | Dormant |
| Sector A: The Martial Remnant | Half page | The stone arena from the top tier: six tiers down to gray sand, racks empty, stone figures between them, one hitting a post. | Bone | Restriction: closed bars on the vault door at the rear |
| Sector B: The Wild Fragment | Half page | Trees giving off blue light from the bark, roots moving around a boot, and forty feet in, a line where the light stops. | Coordinated scene (blue-green) | Dormant, residual traces in the bark |
| Sector C: The Arcane Debris | Half page | The tower that came apart and did not fall: pieces hanging at the angles they broke at, runes lighting as someone walks between them. | Bone, dark-leaning | Instability: displaced layers, competing orientations |
| Sector D: The Civic Fragment | Half page | A courtroom with bedding on the floor, a kettle, ration wrappers opened carefully, and a tally of nineteen days cut into the wall by the door. | Everyday color | Restriction on the one door that will not open |
| The Arriving Initiates | Half page | Three to five non-human Initiates walking into view, exhausted, carrying wounded, armed with the same improvised gear as the party. Their scout in front. Their bodies are alien; their fatigue is legible. (Their race is decided in the lore pass; hold this image until it is.) | Bone | Observation from both sides |
| The Reality Purge | Full page | The wall of white coming across the valley at a walking pace with nothing behind it, the glowing forest going into it, and something very large standing up in the middle ground. | Blue-black and bone | Instability at planetary scale |
| The Causeway | Half page | Forty feet of road with white on one side and a drop on the other, a queue of people on it, and the Warden's bulk filling the far end. | Bone, dark-leaning | Restriction: heavy continuous bars |
| The Other Side | Half page | Grass with no seam in it, weather in the sky, a gate closing behind a group who have just come through and have stopped walking. | Time-of-day (open daylight) | Recognition: fragments aligning over each person |

## The Tutorial on the players' screens

Images the GM shows to one player or to the party from the companion app's Prep, in the order the tutorial reaches them. Phases 1 and 2 come first, since the solo nights run them. Three rules bind every brief here:

- **The viewer is the character.** Frame each scene from where the character stands. No figure stands in for a player character; NPCs and other survivors may appear.
- **No readable text,** as everywhere in the bible. System glyphs carry the meaning.
- **Shown in a scene, never ahead of it.** Each image shows only what the character has just seen.

Deliver each file to `app/packs/images/tutorial/` under the slug in the first column (`the-locked-cache.png`), at the size the Shape column names. The app makes its own screen-sized copy.

### New images

| Slug | Shape | Shown when | Scene | Palette | System intent |
|---|---|---|---|---|---|
| landing | 3:2 | Phase 1, The Fall | On the ground, looking up past grit and scorched metal at a sky the wrong color. Far off across the rubble, small bursts of dust where other things are hitting the ground. A short string of glyphs sits over the whole view like frost on glass. | Bone, with a wrong-colored sky | Communication: one short ordered string over everything |
| the-valley-from-the-rim | 3:2 | Phase 2, Read Aloud: The Valley | From a slope of broken masonry on the inside rim: below, a forest giving off moving blue light; beyond it at the bottom, a gray hill of debris with paths of wreckage fanning out from it like something poured. A line of rain standing still as a wall to the north, a tower hanging in the pieces it broke into to the west. Far off on the rim, one small figure getting up out of a burst of dust. Nobody in the foreground. | Time-of-day (morning haze) | Dormant: faint partial traces over the valley floor |
| the-dying-scavenger | 3:2 | Encounter 1 | An arm's length away, a faceless creature the size of a dog has opened a seam along its own side with one limb and is putting pieces of itself into a stone held against its chest. The stone gives off a low warmth. Up the slope behind it, three more of them, each smaller, each still, each with a stone against its chest. It is paying the viewer no attention. | Bone | None; the stone's warmth is the scene's only light |
| the-rubble-trap | 3:2 | Encounter 2 | From the ground, pinned: the edge of a slab of wall lying across the viewer at the hips fills the lower frame. A crack runs through it near the shoulder. A rusted iron bar lies just past reach. Dust trembles on the rubble, and up the slope, the shadow of something on four legs dragging a fifth. | Bone, dark-leaning | None |
| the-locked-cache | 3:2 | Encounter 3 | A box standing upright in the debris, clean and humming, without a speck of dust while everything around it is buried. Set into its face: a narrow slot the width of a blade, a shallow dish, and a panel of glyphs mid-count. Forty feet to the right, a heap of wreckage still burning. | Bone, with the fire's warm light on one side | Instruction: an ordered string counting on the panel |
| the-high-ground | 3:2 | Encounter 4 | From a ridge of tiered stone, the valley below. To the left and far off, a woman in running clothes backing away from something low and fast, swinging a length of pipe, losing ground toward a drop. To the right and closer, a man in a brown uniform walking a slow circle in the rubble. Straight below at the ridge's foot, a burst footlocker with its contents scattered bright across the rock and a rat-sized shape moving toward them. | Time-of-day | None |
| the-resonance-flicker | 3:2 | Encounter 5 | A cracked stone column about head height standing alone where nothing else stands. A crystal shard the size of a palm is sunk into its base. A pulse is leaving it as a ring through the air, and the colors inside the ring separate. | Bone | Recognition: fragments pulsing toward alignment around the shard |
| the-sorting-machine | 3:2 | Encounter 6 | Fifty feet off in the wreck, a waist-high machine with more legs than it needs, picking objects out of the debris and setting them into two piles. A boot in each pile. The piles look alike. | Bone | None; its own small work light |
| the-tally | 3:2 | Encounter 7 (a handout) | A sheet of hull metal leaning against a stone, scratched with marks in groups of five, rows of them, forty-one in all. The oldest have rusted brown, the newer are gray, the last is bright at the edges. Under the marks, an arrow cut deep and sure, pointing down the slope toward a treeline. Close enough to count. | Bone | None |
| the-first-kill | 3:2 | The First Kill | A broken construct of plates and wire lying still on the debris. Something pale is coming off it like heat over a road, except that it does not rise: it leans toward the viewer and crosses the ground toward them. | Bone | None; the energy is pale, not cyan |
| the-camp-at-night | 3:2 | Phase 3, Making Camp | Night at the foot of the debris hill: a small fire, strangers sitting well apart around it, a wetsuit and pyjamas among the clothes, and over the far rim the wall of moving light. | Everyday color, night | Dormant |
| the-wall-tally | 3:2 | Phase 4, Sector D (a handout) | A courthouse wall beside a door frame, a tally cut into it in groups of five: nineteen marks, the last three shorter and cut by a different hand. Bedding on the floor at the frame's edge. | Everyday color | None |
| the-kith | 3:2 | Phase 4, The Arriving Initiates | Four Kith walking fast into view and looking behind them: narrow upright bodies, two long arms and a smaller pair held close under the ribs, folds down the neck flared. Exhausted, carrying one of their own, armed with improvised gear like the party's. The scout in front has stopped and is looking at the viewer. | Bone | Observation from both sides |
| the-gate | 3:2 | Phase 5, before the crossing | From the debris hill's east shoulder: the last span of an elevated road, forty feet long, running out over a ring of fused glassy shards to a platform with sheer sides, and the broken transit nexus standing on it. Nobody on the span yet. | Bone, dark-leaning | Instruction: ordered strings waking along the nexus's frame |
| marisol-vega | 2:3 portrait | Encounter 4, after the fight | A woman in running clothes, breathing hard, a length of pipe in one hand, looking at whoever came down the ridge for her. | Everyday color | None |

Spots for the finds (square, quiet background), shown when a character picks one up:

| Slug | Scene |
|---|---|
| a-spear | A spear standing upright where it fell, pinning a sheet of tarpaulin to the ground |
| a-battered-medkit | A white case with a red cross on it, slid to a stop against a wall; the cross is almost the right shape |
| a-sparkstone-tablet | The Locked Cache's tablet: a flat stone with a spark held inside it |
| a-ranged-relic | Something like a rifle with nowhere to hold it, lying across a step, one light on its side pulsing slowly |
| a-battered-communicator | A dented handset of no make anyone knows, one light still on |

### Images the book already has

Under `book/assets/art/`, and in the tutorial pack as they are (Gabriel, 2026-10-02); the ones marked *figure* were briefed with one. `app/packs/images/webp.py` makes the app's copies from these masters.

| Shown when | Image |
|---|---|
| Phase 1, The Void | `scenes/the-void.png` |
| Phase 2, the valley's layout | `map/valley-map.png` (the chapter calls the illustration what the characters see; the schematic stays the GM's) |
| The Arrival | `scenes/the-arrival.png` (*figure*) and the spots `husk-crawler.png`, `frenzy-rat.png` |
| Encounter 8 | `people/ray-okafor.png` |
| The Locked Cache's contents | `spots/the-reactive-buckler.png`, `spots/healing-pills.png` |
| Scavenging | `spots/a-skill-shard.png` |
| Phase 3, The Node | `scenes/the-recycling-node.png`, and `openers/items.png` for the pile (*figure*: people around it) |
| Phase 3, the Node strangers | `scenes/marco-dele-and-wren.png` |
| Phase 3, The Scarcity Test | `spots/a-resonance-shard.png` |
| Phase 4, the sectors | `scenes/sector-a-the-martial-remnant.png`, `scenes/sector-b-the-wild-fragment.png` (*figure*: a boot), `scenes/sector-c-the-arcane-debris.png` (*figure*: someone walking), `scenes/sector-d-the-civic-fragment.png` |
| Phase 4, creatures | the spots `snarljaw.png`, `alpha-snarljaw.png`, `glow-stalker.png`, `training-sentry.png`, `husk-sentinel.png`, `fragment-wraith.png` |
| Phase 4, The Offering | `scenes/the-offering.png` |
| Phase 5, the Purge | `scenes/the-reality-purge.png` |
| Phase 5, the Warden | `scenes/the-corrupted-system-warden.png` |
| Phase 5, the crossing | `scenes/the-causeway.png` (*figure*: the queue) |
| Phase 6, The Other Side | `scenes/the-other-side.png` (*figure*: the group) |

## People

| Image | Placement | Scene | Palette |
|---|---|---|---|
| Kara | Portrait | A direct fighter, an axe over one shoulder, looking at whoever is holding the sheet. Contemporary clothes, one alien bracer. | Everyday color |
| Joe | Portrait | A broad man with a shield made from a car door and a medkit strap across his chest. | Everyday color |
| Andre | Portrait | A lean scout with a short bow, looking past the viewer at a route. | Everyday color |
| Ray Okafor | Portrait | Delivery uniform, blood run into one eye, a nail gun held not quite steady. | Everyday color |
| The scout | Portrait | Hold until the lore pass names the race. | Bone |
| Marco, Dele, and Wren | Half page | Three survivors at the Node camp: a man in a wetsuit with both hands on a speargun, an older man taking a dead phone out of his coat, a teenage girl thirty feet from everyone. | Everyday color |
| The Corrupted System Warden | Full page | A maintenance construct the size of a building, walking toward a gate, indifferent to the people in its path, its own glyphs misaligned and flickering. | Blue-black | Instability on its own surface |

## Bestiary (one spot per entry)

Square, quiet background, the creature's silhouette first. The System's classification brackets on each, fine and localized.

| Entry | Scene |
|---|---|
| Glow-Mote Swarm | A drifting cloud of pale points with a shape inside it that keeps changing |
| Husk Crawler | A pre-System corpse on four limbs, dragging a fifth, no face where a face should be |
| Frenzy Rat | Two of them, because they hunt as a pair, mid-lunge from opposite sides |
| Pre-System Brigand | A human in scavenged gear with a pipe, more frightened than dangerous |
| Snarljaw | A low predator with too much jaw, seen at the tree line, eyes paired |
| Glow-Stalker | Mostly unseen: a shape in the blue light of the forest with one bright edge |
| Training Sentry | A man-height stone figure with a post in front of it, mid-strike |
| Rival Initiate | Another Integrated human with a better weapon and a title mark the System shows |
| Husk Sentinel | An automated defense unit filling a doorway, classification bars closed across the door |
| Alpha Snarljaw | The pack leader standing over stripped bones, not fleeing |
| Fragment Wraith | An incorporeal shape in the tower's lower halls, a weapon passing through it |
| Corrupted System Warden | Use the full-page image above, cropped |

## Items (spots)

| Image | Scene |
|---|---|
| The Reactive Buckler | A small shield mid-discharge, its field collapsing in one visible flash |
| A Skill Shard | A thumb-sized crystal fused into masonry, glowing through dust |
| A Resonance Shard | The same shape, but the glow is inside it and does not reach the surface |
| Healing Pills | Three pills in a cracked case, one warmer than the others |
| An Attribute Treasure | The Snarljaw Heart, still faintly warm, in a hand |

## Rules chapters (half-page scenes where a rule benefits from a picture)

| Image | Chapter | Scene | System intent |
|---|---|---|---|
| Yield | Core Mechanics | A figure giving ground on a stair, the attacker's swing closing on air, the Margin's brackets shrinking | Evaluation, shrinking |
| Downed | Core Mechanics | A person at 0 HP on the floor, a creature turning away toward a live threat, an ally three steps off | Observation, a countdown as three fine ticks |
| Aura Pressure | Core Mechanics | A small figure under a vast passing shape, knees buckling, the shape not looking down | Restriction: heavy bars from above |
| Consolidation | Cultivation | A resting party, one on watch, the sleepers' outlines quietly re-aligning | Recognition, slow |
| Saturation | Cultivation | A figure past Tolerance: skin hot, vision tunneling, the System's marks on them overprinted and out of register | Instability |
| The Breakthrough Check | Grade Breakthroughs | The moment of Ignition: a person at Stage 4 with the diagram one gap from closed | Recognition, near-complete |
| A Mandate | System Quests | A whole crowd receiving the same heavy message at once, in a market | Restriction and judgment: one huge mark |
| The Offering | System Quests | A construct holding out a knife and a seed, one in each hand | Communication: two ordered strings, one per hand |
| The Session-End Sweep | The Hidden Vector Engine | A GM alone at a cleared table with one sheet and a pencil, the players' chairs pushed back | Dormant |

## Lore and vignettes (after the lore pass)

Each color vignette and each lore box gets a spot or half page once its text exists: Aether felt for the first time, the monk who sat with Weight for sixty years, the survivors' forum, the found log from the sleeping cave. Add them here as the lore pass answers Parts A through D.

## Not for ChatGPT

Functional graphics stay vector and are built in the pipeline or the kit, not generated: the Principle loop diagram, Zone and Beat diagrams, the interrupted frame, the icon set, and everything with real text on it.
