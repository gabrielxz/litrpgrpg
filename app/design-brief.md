# Design brief: the companion app's look

Gradebreaker is a tabletop RPG in the LitRPG and progression-fantasy genre (*Defiance of the Fall*, *Primal Hunter*): people on an ordinary Earth are pulled into a System that grants levels, classes, titles, and quests. The companion app runs the game at the table. The GM keeps the campaign's record in it, the app listens to the table and drafts events and suggestions for the GM to confirm, and each player sees their character through the System's interface.

The app works. Its look reads as office software. This brief asks for a visual design that puts the app in the game's world and looks good doing it. The job is the look: behavior, flows, and copy stay as they are unless a proposal is listed separately (see "Proposals").

## Read first

- **The art bible**, `book/art/art-bible.md`. The whole file sets the direction; §5 (the System's visual grammar), §6 (functional icons and the interrupted frame), §7 (typography), and §9 (website and companion app) bind this work. Where this brief and the bible disagree, this brief wins.
- **The reference images**, `book/art/references/`. `01-office-bone.png` is the standard every image is judged against; `05-terminal.png` is the closest to an interface.
- **The emblem**, `book/art/emblem/clave-mark-cyan.svg` and `clave-mark-ink.svg`. The clave is the one symbol: the System's mark and the game's emblem.
- **The current app**: `app/packages/web/src/styles.css` (one plain-CSS file with custom properties), `gm/GmCampaign.tsx` (the GM's screen and its sections), `player/PlayerCampaign.tsx` (the player's screen), and `text.ts` (the player-facing notices).
- **What a player may see**, `book/57-what-can-be-seen.md`, and **how the System speaks**, "The Voice of the System" in `book/45-system-ai.md`.
- **The book PDF**, for mood. It sets EB Garamond for prose, Alegreya Sans for the System's text, JetBrains Mono for labels and numbers, and Chakra Petch Bold for display (the cover's GRADEBREAKER).

## Two registers

The app has two audiences, and they get two registers of one visual language.

**The player's screen is the System's interface.** In the fiction, a character sees a status screen, a quest log, and notices the System sends. The player's screen is that interface, as if it appeared in front of the character. It speaks in world terms only: Attributes, levels, Grades, Health, Aether, titles, quests. It never mentions rounds, rolls, dice, or turns. It is dark by nature: blue-black ground, bone text, cyan System geometry. The glyph grammar in the bible (§5) belongs here: observation as fine open brackets, recognition as fragments resolving into alignment, restriction as closed bars, dormant states as low-contrast traces.

**The GM's screen is the operator's console.** It runs the table's machinery in the table's words: rounds, Beats, DCs, the Hidden Vector Engine's axes, drafts waiting for confirmation, undo. It cannot be in-world without renaming the book's terms, so it is not diegetic. It should still be on theme and look good: the same palette, type, and emblem, angular shape relationships, the System's cyan wherever the GM is handling something the System will show a player. A reference point: the desk of the person who operates the System.

**Where the registers meet.** The GM confirms anything a player will see (awards, notices, titles, quest offers) before it is sent. Wherever the GM's screen previews such an item, it renders in the player's register, so the GM sees what the player will get. The GM's "Player view" section shows a player's screen exactly as that player sees it.

## The moments

The power fantasy is the game's first priority: numbers go up and players feel it. Motion and System effects are spent on these moments and nowhere else:

- Level up, and the free points it brings
- A Grade breakthrough
- A title conferred
- A technique acquired, or advanced, from an exploding roll
- A class offer arriving, and a class taken
- A Principle's Distillation
- A quest offered, and a quest completed
- A character Downed (the System reports "vital coherence" counting down from 3)

Each gets a treatment on the player's screen, sized to its weight: a Grade breakthrough is rarer and larger than a level up. The GM's screen gets a quiet echo when one lands. Everything else on both screens stays still. Every effect has a reduced-motion form.

## Constraints

- **Color carries meaning.** Cyan is the System. Gold (`#7D5F1E`, and a lighter step of it for dark grounds) is the world: lore, places, people. Nothing else uses either. Status colors (danger, warning) are always paired with a word or an icon.
- **Interactive elements have their own treatment.** Decorative cyan must never make something look clickable, and a button cannot be marked by cyan alone.
- **Quiet where people work.** Character sheets, tables, forms, and frequent controls stay quiet. No HUD frame around every statistic, no textured panels everywhere, no glow on every button, no glyphs rotating behind text. The interrupted frame (§6) is used sparingly.
- **Type.** Use the book's families or propose replacements for them; do not add a third decorative face. Numbers in tables and trackers use tabular figures. Fonts must be licensed for web embedding (the book's are all OFL).
- **Copy stays.** The player-facing strings live in `text.ts`, and a test holds them to the System's voice. Mockups may use the existing strings or placeholders; the real copy is kept. System text is set in bare italics, with no brackets or bold (a quest's ID, such as `[Q-181]`, keeps its brackets).
- **What Can Be Seen.** A player's screen never shows what the rules keep from the player: another being's Attributes, Health, Aether, class, or quest log (the party frame is the exception: party members' Health, Aether, and whether they are Downed), the Hidden Vector Engine's axes, or a Hidden quest's details. A few class techniques open a narrow exception, which the code already handles. Design each player screen from what the code sends it.
- **Behavior stays.** Confirm taps, undo, and the GM's approval of anything a player sees are the app's rules. The design can make them clearer; it keeps them.
- **Accessibility.** Visible keyboard focus, WCAG AA contrast for text, layouts that survive 200% text zoom, and `prefers-reduced-motion` honored.

## Scope

- **PC only for now.** Desktop browsers with mouse and keyboard; no phone or tablet layouts.
- **The GM's screen** is designed for a window 1440 px wide and holds up from 1280 to 2560.
- **The player's screen** must work in a window 960 px wide: sessions are often played online, with the app beside a video call.
- **Themes.** The player's screen is dark. The GM's screen gets a light and a dark theme, following the operating system's setting, since a session runs three to four hours, often in low light.

## Screens

In order of priority. The first group sets the language; the second applies it.

**First**
1. The player's screen (`player/`): the status bar, Attributes and allocating free points, the party frame, what the character carries, titles, the quest log, the fight view (`Fight.tsx`), class offers and the class held (`Class.tsx`), the Principle (`Principle.tsx`), and the System's notices.
2. The GM's frame: the section navigation with its waiting counts, and the table bar under it (the session, listening, and the clock).
3. Combat (`gm/Combat.tsx`, with `Clock.tsx`, `Sizing.tsx`, `Aftermath.tsx`): the fight tracker, which the GM watches most.
4. Party (`GmCampaign.tsx`): every character's sheet and the forms that change it.
5. Suggestions and drafts (`gm/Suggestions.tsx`, `Drafts.tsx`, `Heard.tsx`, `Events.tsx`): what the listener heard and what it proposes, each waiting on the GM's confirmation.

**Then**
6. Prep, Bestiary, Quests, Principles, Classes, HVE, the campaign log, Rules (questions answered from the book), Table (members, invites, and test recordings with their line corrections).
7. Character creation (`player/Creator.tsx`).
8. Sign-in, the home screen (campaigns), and joining by invite (`pages/`).
9. Empty states and onboarding, where an illustration earns its place.

## Deliverables

- **Design tokens** as CSS custom properties: color for each theme and register, type families and scale, spacing, borders and corners, elevation, and motion durations and easings.
- **Components**: button (primary, quiet, destructive), field and select, panel, list row, tracker row, stat block, tag and count, notice, confirm tap, draft card, section navigation.
- **Icons and System glyphs** as SVG. Functional icons form one small family with stable meanings (§6); System glyphs may vary.
- **Mockups** as HTML and CSS, one per screen in the list above, using the tokens and components. No screen exported as a single image.
- **Motion specs** for each moment above, with its reduced-motion form.
- **Where illustration goes.** Mark each place a painted image would earn its place (headers, empty states, onboarding) with its size and crop. Paintings are generated separately to the art bible; the design shows the slot.

The app is React with one plain-CSS stylesheet. Deliver in plain CSS on custom properties: no Tailwind, no component library, no CSS-in-JS. Claude Code ports the design into the app.

## Proposals

Changes beyond the look, such as regrouping the GM's sections, merging screens, or a different navigation, are welcome. List each as a separate proposal with what it changes and why, so each can be accepted or cut on its own.
