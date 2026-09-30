# Combat

The Combat section runs one fight at a time, from setup through the rounds to the kills, VE, and loot afterward. The rules it follows are in Core Mechanics, "Combat".

Everything you press on the tracker records at once, and **Undo** takes it back. The side menu shows the fight's state beside **Combat**: *Set* before Momentum is rolled, *Round 3* during play, *To settle* once it has ended.

## Setting up a fight

![The setup screen for a new fight, with sides, Zones, characters, creatures, and the sizing reading.](gm-combat-setup.webp)

With no fight running, **Combat** opens on **A new fight**.

1. Under **Name, sides, and Zones**, give the fight a name and name the sides. It starts with two, *The party* and *Hostiles*; **Add a side** adds more, up to 6. Type the Zones separated by commas (*The bar, The floor, The doorway*). Everyone starts in the first Zone.
2. Under **Characters**, pick each character's side. Characters your players hold start on the first side; characters you hold start as **Not in the fight**.
3. Under **Creatures and NPCs**, pick a stat block **From the Bestiary**, set **How many** (1 to 20) and the **Side**, and press **Add**. Several of one creature are numbered: *Snarljaw 1*, *Snarljaw 2*. For anyone without a stat block, open **Someone not in the Bestiary** and enter a name, what happens **At 0 HP** (an NPC is Downed, a creature dies), Grade, HP, Beats, and **Momentum Force** (the higher of its HRT and PER Force). **Remove** takes a combatant off the list.
4. The **Start** panel on the right reads the fight against the Bestiary's sizing table for the characters you placed: *A standard fight for 4 at Level 8*, with this party's columns and any notes. **Party level** overrides the computed average. Creatures on a side with a character count as allies and stay out of the reading.
5. Press **Start the fight**. It needs someone on at least two sides.

**Save this fight to Prep** keeps the fight in [Prep](guide:gm-prep) under a title. A fight opened from Prep also offers **Save the changes to Prep**, which updates the prepared item.

## Momentum and the round

Before rolling, **An ambush? Give the Surprise Beat** lets you tick the combatants who achieved true surprise. Each gets a *Surprise Beat* tag and one free Beat before Initial Momentum: press **Kara acts** on their row, spend the Beat, and press **Done**.

**Roll Initial Momentum** rolls on the server. Each side rolls once, by its combatant with the highest Momentum Force; a tie rolls again. Sides take their turns in order of their totals, and the dice appear under **Recent rolls** in the right column.

The side holding Momentum is listed first with a *Momentum* tag, and the side whose turn it is shows *Taking its turn*. On that side, press **Joe acts** on a row to open that combatant's turn. When every side has acted, a callout says so and **Next round** is highlighted. **Next round** ticks every Downed countdown, applies any pending Momentum shift, puts sides that joined late at the end of the order, and refreshes everyone's Beats, less any they Yielded.

Momentum shifts two ways. **Seize Momentum** is a Beat on the acting combatant's controls, offered to anyone off the holding side; the server rolls it against the holder's best roller, and a win shows *Shifts to The party next round (Seize)* in the header. Under the header, **Decisive Tactical Reversal** has a **Momentum to Hostiles next round** button for each other side; press it when you call a Reversal.

When a combatant of a higher Grade is in the fight, an **Aura Pressure** panel names everyone below its Grade who still owes the Will Save. Press **Carried calmly: Moderate (90)** or **Flaring: Hard (115)** and the server rolls each save.

The Zone cards above the tracker show who stands where; **Edit Zones** renames or adds Zones.

## The tracker

![The combat tracker mid-round, with the acting combatant's drawer open and a Clash docked on the right.](gm-combat.webp)

Each row shows the combatant's Momentum Force, Zone, conditions (*Exposed*, *Downed: vital coherence 2*, *Suppressed*), HP, and Beat pips.

- Type a number in the HP box and press **Damage** or **Heal**.
- **Out** removes someone who fled, fell, or left the scene.
- The caret opens a row's drawer; the acting combatant's drawer is always open.
- Off their turn, a row shows **Free strike…** and any reaction their class gives.

The drawer holds what the combatant can do:

- **Move (1 Beat)** to the Zone chosen in the list, a class's free move if they have one, or **Place** to set them in a Zone for no Beat (driven, thrown, carried).
- **Exposed** and **Suppressed** toggle those conditions. A Suppressed character facing an aura shows **Entity hurt: save again**.
- On their turn: **Attack…**, the Beat kinds **Check**, **Item**, **Application**, and **Disengage**, a free-text **Other** with **Spend**, **Seize Momentum**, **Flare aura** for an entity with an aura, and **Done** to end the turn.
- Below those: **Pill…**, **Stabilize…**, **Execute…**, the class technique, **Push back (1 Beat)** when Suppressed, and **Intervene…** for a Suppressed ally.

A player can record their own character's turn from their screen; you see it land on the tracker. See [a fight from the player's side](guide:player-fight).

## The Clash

**Attack…** opens the attack form: the target, an optional label (*Axe*), the Attribute or stat block line, the weapon shape, modifiers, Advantage, the class technique, Surge, **Flanking +10** (pre-ticked when the Zones suggest it), and **Target Cornered**. Press **Kara attacks (1 Beat)**.

The Clash docks in the right column, headed *Kara attacks Snarljaw 2*.

1. The defense. A character's player can answer on their screen, or you record it here. Choose the defense and press **Roll the Clash**. The server rolls both sides.
2. The Yield. The panel shows both totals and the Margin. Each button shows the damage after the Grade multiplier: **Take 40**, **Yield 1 Beat: 20**, and so on, marked where the hit Drives Back. A character's player can choose on their screen. A class cover appears as a button that cuts the Margin first.

While a Clash waits, nobody can take a turn, spend a Beat, or start the next round. After it lands, the panel keeps one line saying what happened, with a **Drive** control when the attacker may drive the defender into another Zone.

## Downed and death

At 0 HP a character or NPC is Downed at vital coherence 3, which falls by one at each **Next round**, the round of Downing included; at 0 they die. A creature dies at 0 HP. A single hit of 10 times Max HP or more kills outright. **Heal** on a Downed combatant wakes them at the restored HP.

A Downed row shows **Your ruling:** with **Stabilized** and **Dies**. A creature that died at 0 HP shows **Left alive** instead, for one you want to question. The rules are in Core Mechanics, "Downed and Death".

> A character's death is permanent and cannot be reversed with a ruling. If it was a mistake, undo the action that killed them.

## Undo

**Undo** takes back the latest tracker action still standing, one press at a time. It stops at the fight's start. The start itself, and anything recorded after the fight ends, is undone from [the Campaign log](guide:gm-log).

## Joining and leaving

**Someone joins the fight**, below the tracker, adds a character (pick the **Character** and **Side**, press **Add**) or creatures and NPCs from the same picker as setup. A prepared NPC joins from Prep. Bringing someone in can be a Decisive Tactical Reversal; call it with the buttons under the header.

## Ending the fight

Press **End the fight…**, then **End The fence line** to confirm, or **Keep fighting**. The app refuses to end the fight while a Clash waits or while a character is Downed and not stabilized: stabilize them or run the rounds out. When it ends, a stabilized character wakes at 1 HP, and a character who survived Downed is marked due a Battle Memory Card.

## After the fight

![The aftermath panel with kills, participants and their VE, and the loot.](gm-aftermath.webp)

The aftermath panel, **After The fence line**, replaces the setup screen until you settle it.

- **Kills** lists every creature and NPC who died. Set each kill's **Tier for the party** (filled from the Bestiary), tick **×1.5** for a boss, confirm the **Finishing blow** (filled from who landed it), and set a different tier for any participant under **Tier differs for**.
- **Took part** has a box for each character in the fight; a character who died is greyed out. The VE each participant collects is computed at their own tier; type a number beside it to override.
- **Loot**: **Roll loot** makes one roll per kill and shows each row, die, and drop. Enter what actually dropped with **Add an item** (the catalog's names are suggested). It goes into the spoils, and the players divide it on their screens.

Press **Settle The fence line**. The preview shows the VE, confirmed kills, and spoils, and what each player receives. Settling is one action and undoes as one from the Campaign log, as does the loot roll. The rules are in Cultivation, "Combat Kills" and The System AI, "Loot".
