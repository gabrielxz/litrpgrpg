# Prep

The Prep section holds what you make ready before a session: fights, quests, System notices, loot, NPCs, and images. Firing a prepared item at the table records the real thing; the item stays in Prep until you remove it.

![Prep with items grouped by scene on the left and the forms for new items on the right.](gm-prep.webp)

Players never see Prep. They see what you fire from it: the notice, the loot, the quest, the fight, the image.

## The items

Items are grouped by the **Group** you give them (*Scene 1: The depot gate*), in order by name; an item with no group sits under *Unsorted*. Each card shows its kind (**Fight**, **Quest**, **Notice**, **Loot**, **NPC**, **Image**), its title, your cue for when to use it, and a count once it has gone out (*fired once*, *fired 3 times*).

Each kind fires its own way:

- **Notice**: **Send…** opens the text, *The notice, as it will reach them*, for you to edit (fill in the counts the moment decides), and a **To:** row with a box for each living character. Every player's character is ticked to start. Press **Send the notice**.
- **Loot**: **Give…** opens a **To** list: *The spoils, for the party to divide*, or one character. Press **Put it in the spoils** or **Give it to Nia**.
- **NPC**: an NPC with HP shows **Joins the fight…** while a fight is running. Pick the **Side** and press **Mara joins The lobby**. An NPC without HP is a reference card for their name, who they are, and their line.
- **Fight**: **Set up the fight** opens Combat's setup filled in with the fight's name, Zones, and creatures. Place the characters there and press **Start the fight**. The button is hidden while a fight runs or its aftermath waits. See [Combat](guide:gm-combat).
- **Image**: the card shows the image and its caption. **Show…** opens a **To:** row with a box for each living character, every player's character ticked to start, and below it the image as each player will see it. Press **Show the image**. It opens full-screen on each player's screen and stays in their **Seen** strip. An image or a handout is the world showing itself, so it never enters the System's notices. Undo it from the Campaign log to take it back off their screens.
- **Quest**: **Issue…** opens the Quests form filled in. Pick the holders there and issue it. See [Quests](guide:gm-quests).

Sending a notice, giving loot, showing an image, and bringing in an NPC each show a preview first, including what each player will receive, and record when you press the button.

**Edit…** opens a notice, loot, an NPC, or an image for changes in place (an image takes a new file under **Replace the image**, and a **Caption**); **Save the changes** keeps it under the same item. A fight edits in Combat's setup and a quest in the Quests form: **Edit…** says so and offers **Open it there**, and saving from that form updates the item in Prep.

**Remove from Prep**, at the foot of each card, folds out **Remove** with the item's title.

## Preparing something new

The right column holds four forms and the pack loader.

- **Prepare a System notice**: a **Title**, a **Group**, **The System's text**, and **When to send it**. Press **Prepare the notice**.
- **Prepare loot**: type a **Title**, then list what it holds, one item per line (`Healing Pill × 2`; a line with no count is one). Add a group and a cue and press **Save the changes**.
- **Prepare an NPC**: type a **Name**, then **Who they are**, **Their line** (their condition, and how the party treated them), and **Where they come in**. Give them numbers to let them fight: **Grade**, **HP**, **Beats**, **Momentum** (the higher of their HRT and PER Force), and one **Force** used for their attack and defense. Leave **HP** empty for an NPC who does not fight.

- **Prepare an image or a handout**: choose the file (PNG, JPEG, or WebP). The app shrinks it to 1600 pixels on its longest side and stores it with the campaign; the **Title** fills in from the file's name. Add a **Group**, a **Caption** shown under the image, and **When to show it**, and press **Prepare the image**. A handout is any image: a map, a page, a tally scratched in metal.

A title already in use shows a warning: saving replaces that item.

A notice's text is checked for the table's words. If it uses one of them (round, Beat, roll, and others), a warning names them: *The System speaks in-world units.* You may keep them, for a title like *Thin Margin*. The System's voice is described in The System AI, "The Voice of the System".

Fights save to Prep from Combat's setup (**Save this fight to Prep**) and quests from the Quests form.

## Packs

The **tutorial pack** panel loads The Tutorial's notices, quests, fights, loot lists, recurring NPCs, and 49 images, grouped by phase: the scenes, creatures, people, and finds a character sees, from the arrival to the far side of the gate. Each image's title is what the player reads under it, and its cue names the moment to show it. Press **Load the tutorial pack**. Once loaded, the panel says *Loaded.*, or how many of its items are in Prep, and **Load it again, replacing its items with the book's** restores any you edited or removed.

**Load a pack from a file** takes a YAML or JSON file shaped like `rules/tutorial.yaml`: a `pack` name, then notices, quests, encounters, loot, and npcs, each with its group. A pack's `images` name files that ship with the app, so a pack of your own carries no images; prepare yours with the image form. After you choose the file, the panel counts what it holds and warns if some items are already in Prep. Press **Load** with the pack's name.

A pack can also carry setup: characters, VE, titles, and the rest of a campaign's starting state. **Record the setup** records those actions in order and counts as it goes (*Recording 40 of 119…*). If one is refused, the run stops and shows the reason; pressing again records only what is missing. When it finishes, give the characters to their players in [the Party section](guide:gm-party).

## Undoing

Saves and removals in Prep are recorded in the campaign log. A pack loads as one save, so one undo removes the whole pack. The Campaign log hides Prep entries until you tick **Show Prep entries**; undo from there. See [the Campaign log](guide:gm-log).
