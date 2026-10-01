# The Record panel

The Record panel sits on the right of [the Party section](guide:gm-party) and holds a form for every change you make to the record outside a fight.

![The Record panel on the Award VE tab, with the preview and what each player receives below the form.](gm-record.webp)

The panel opens on **Award VE**, or on **New character** while the campaign has none. After each record the form clears.

## The preview and the button

Every form except **Dice**, **Counts**, and **Inspection** ends in a preview and a button named for the action (**Award 130 VE**, **Create Kara**). The button stays disabled until the preview accepts the draft.

- **If you record this** lists what the action does and, for each character it touches, the changes to their sheet. A character the action adds is marked **New character:**.
- **This cannot be recorded** gives the rule it breaks, and the button stays off.
- **Earlier-recorded actions that would stop applying:** lists, by number in the log, any action already recorded that this one would break.
- Below, in the System's register, each player's notices: *Kara receives*, or *Kara and Joe each receive* when they get the same words. A player sees nothing until you press the button.

The preview refreshes whenever anything else is recorded, so a form left open shows what it would do to the record as it stands. A double click records once. Every record can be undone from [the campaign log](guide:gm-log).

## The tabs

### Dice

The table's dice, rolled on the server. Choose **Who rolls**: any character, or **Someone else…** with a **Name** and **Grade** for a creature or NPC. Choose **Clash**, **Check**, or **Table** (a d100 read against a table, such as an item's effect or the collapse clock; it does not explode).

- **Resistance**, on a Check, reads the result against the Resistance card. Players never see the Resistance or the outcome.
- **With** names the weapon shape on a character's Clash: its Proficiency bonus applies, and an exploding die earns a Mark.
- **Surge** adds +5 for the character's Aether cost; it is disabled when they cannot afford it.
- **Private** hides the roll from every player.
- **Dice rolled by hand** takes dice rolled at the table: the kept die and any it exploded into (`97 12`), and the lower die under Advantage.

**Roll for Kara** (or **Record Kara's dice** for typed dice) records at once, with no preview. **Recent rolls** lists the 40 newest, fight rolls included, with the outcome against the Resistance and the **Battle Memory Card** flag for you alone. Players see every roll that is not private, on their own screen.

### Award VE

Choose the **Source**: **Kill**, **Quest**, **Core**, **Ambient absorption**, **Hidden Achievement**, or **Other**.

For a kill, each character's **Tier for them** sets their award from the book's kill table. Tick who receives it. Each character's **VE** fills in from the rules at their own Grade and can be overwritten. Every participant collects the full award; nothing is divided. Each player's notice reads *Volatile Energy absorbed: 130.* A fight's VE is settled in its aftermath in [Combat](guide:gm-combat); this tab is for the rest. The tables are in Cultivation, "Awarding VE (GM Reference)".

### Consolidation

A structured rest. Tick who rests (leave out a guard) and set each character's goal: **Process everything**, **Until the next level**, or **A specific amount**. **Hours** fills in from the goal; overwrite it with the hours completed, and tick **Interrupted** for a rest cut short, which keeps the hours done.

When the campaign runs the in-game clock, a box moves the clock forward by the longest rest after the rest records; the clock move is its own entry in the log and undoes separately. The rules are in Cultivation, "Consolidation (Structured Rest)".

### Assigned points

The 3 Attribute points each level brings (scaled by Grade), placed by how the character behaved since the last level. The tab lists only characters with points due.

When the character has HVE entries since the last placement, a line tallies them and proposes a placement; **Use the proposal** fills it in. Otherwise, click a row of the behavior table to place 2 in its primary and 1 in its secondary, or type the split. You must place exactly the points due. Points past the Grade cap are lost, and a warning says so. From Level 10, points wait for the character's class, which places them; offer classes under [Classes](guide:gm-classes). The player's notice reads *Attributes allocated:* and the points. The mapping is in Progression, "Behavioral Stat Mapping (GM Reference)".

### HP and Aether

A **Change** is negative for damage or spending, positive for healing or restoring. A fight's damage and spending are recorded in Combat; use this tab for everything outside one.

### Items

Three modes:

- **Give**: to a character or **The spoils**. Item names suggest from the book's Items tables; any name works. A player receives *Item registered:* and the item.
- **Used up or lost**: pick the holder and one of the items they carry.
- **Attribute Treasure absorbed**: the treasure's **Size** and **Its Grade** raise **The Attribute the player chose**. A treasure of another Grade is used up and does nothing, and a warning says so. The hour is spent defenseless; the clock does not move, so move it yourself if the hour was not part of a rest. A running fight refuses it. The rules are in Items, "Attribute Treasures (Category)".

### Marks

Records a Proficiency Mark in a weapon shape. A Clash that names its shape records the Mark itself when the die explodes; use this tab when the shape was unclear at the roll. The rules are in Core Mechanics, "Marks".

### Titles

Choose the character, then **From the book** (the F-Grade catalog by group, and the tutorial's titles) or **Written fresh**. A fresh HVE-Resonant title needs its **Axis pair**; a fresh Bestowed title can be marked **Negative**, which requires a **Release condition**. A warning appears when the name uses the table's words (round, Beat, roll); keep the word if it means something else there. Press **Confer Iron Nerve on Joe** to grant it; the player's notice reads *Title conferred: Iron Nerve.* Bonus sizes are in Titles, "Bonus Magnitudes".

Below the form, the character's titles are listed. A negative title that is active has a choice to convert it into a catalog title when the release was earned, and a **Release…** button that opens the preview of what the player receives. Press **Release Salvaged** (or **Release Salvaged into** the title it converts into) to record it.

### Counts

Every count toward a catalog title, with the titles it unlocks and at what number. Counts marked **from the record** (kills, Consolidations, surviving Downed, and others) count themselves. The rest are deeds only the fiction knows; press **+1** when one happens, which records at once. When a count reaches its trigger, the title appears on the **Titles due** card in [the Party section](guide:gm-party). Players never see counts or thresholds. Undo a mistaken tick from the campaign log.

### Inspection

Shows what one being reads of a character's titles by the Grade gap. **Who looks** can be a character, or **An NPC or creature** of a Grade you pick. A look at a character a Grade or more above reads *It does not resolve.* Nothing is recorded, and Inspection costs no Beat. The rules are in What Can Be Seen, "What You See of Others".

### System message

Sends the System's words to one character, several, or everyone. Write the text under **The System says**; a sample shows it as the player will see it, and a warning names any of the table's words it uses.

With the AI key set (see [the Table section](guide:gm-table)), **Draft it in the System's voice** takes what the System conveys in your words and replaces the message with a draft for you to edit. With one recipient, **Draft a summary of Kara** writes the System's summary of the character, or the Integration Complete summary when that box is ticked. A draft that adds anything you did not give, or may break the voice, says so.

Tick **Hold it and send it later** to keep the message back. Held messages list under **Held**; **Send now…** and **Discard…** each open a preview before they record. Players see nothing of a held message until you send it. The voice rules are in The System AI, "The Voice of the System".

### Party

Players invite, answer, and leave on their own screens. Record it here for a player away from theirs, or **Disband** a party. **Answer** shows how many invitations wait. Each player involved receives the party notice. The tab needs two characters.

### New character

**Ready-made** picks one of the book's pregenerated characters. **Point buy** takes a **Name**, a **Background** (one or two lines of life before Integration), and 40 points across the seven Attributes, each from 3 to 10. **Player** assigns the character, or leaves it **Held by the GM**. The rules are in Character Creation.

### Collapse

For a character at Critical Saturation, whose collapse clock is running. Roll the clock at the end of each full hour at Critical (a **Table** roll on the Dice tab), and when the collapse comes, record it here: the character, **Point lost (player's choice)** of FOR or POW, and **High density site**. The player's notice names the hours of enforced Consolidation and the Attribute reduced. With nobody at Critical, the tab says so. The rules are in Cultivation, "Volatile Energy & Consolidation".
