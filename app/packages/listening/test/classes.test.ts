/**
 * Class offers: every fixture reaches Level 10 with its record, the standing instructions carry
 * the book's own prompt, and the model's offers come back as packages checked by the book's rules.
 */
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { describe, expect, it } from "vitest";
import { type DraftClassesOutput, classOffersOf, classRecordOf, draftClassesPrompt, draftClassesSystem, dueOffers, loadClassFixtures } from "../src/index.ts";

const engine = new Engine(loadRules());
const fixtures = loadClassFixtures();

describe.each(fixtures.map((f) => [f.id, f] as const))("class fixture %s", (_, f) => {
  it("reaches Level 10 due its offers", () => {
    const c = classRecordOf(engine, f).sheets().get(f.characterId)!;
    expect(c.level).toBe(10);
    expect(dueOffers(engine, c)).toBe(true);
  });
});

type Offer = DraftClassesOutput["offers"][number];
const offer = (name: string, extra: Partial<Offer> = {}): Offer => ({
  book: null,
  name,
  notice: `${name}. Selection: Strength +10. Growth: Strength, Strength, Fortitude.`,
  role: "a role",
  weighs: "the record",
  profile: { shape: "Fixed", points: [{ attribute: "STR", points: 2 }, { attribute: "FOR", points: 1 }] },
  technique: { name: "Blow", cost: "Frequency", effect: "+10 to an attack Clash", drawback: null, reaction: false, noBeat: false, actionEconomy: false, clash: { bonus: 10, side: "attack" }, heal: null },
  permission: { name: "Way", effect: "A decision", actionEconomy: false, onceADay: false },
  guarded: false,
  everyFight: true,
  ...extra,
});

describe("class offers", () => {
  it("instructs from the book's own prompt and the rules data", () => {
    const system = draftClassesSystem(engine);
    expect(system).toContain("Build three class offers for this character from the record below.");
    expect(system).toContain('"counts 10 higher" for +10 to the Clash');
    expect(system).toContain("Breaching Vanguard (Fixed: 2 STR, 1 FOR)");
    expect(system).toContain("Burner (Guided");
    expect(system).toContain("No busywork.");
    const f = fixtures.find((x) => x.id === "kara-apex")!;
    const prompt = draftClassesPrompt(engine, classRecordOf(engine, f), f.characterId, { keepsDoing: f.keepsDoing });
    expect(prompt).toContain("Hunger: The table went quiet when she ate it.");
    expect(prompt).toContain("The GM has not asked for one");
    expect(draftClassesPrompt(engine, classRecordOf(engine, f), f.characterId, { guarded: true })).toContain("A killing blow restores 5 Aether");
  });

  it("returns packages checked by the book's rules: a book class as written, a hook the app applies, problems named", () => {
    const out = classOffersOf(engine, {
      offers: [
        offer("Breaker", { technique: { ...offer("x").technique, reaction: true } }),
        offer("Breaker", { profile: { shape: "Fixed", points: [{ attribute: "STR", points: 2 }] }, guarded: true }),
        offer("anything", { book: "Witness" }),
      ],
    });
    const repeated = classOffersOf(engine, { offers: [offer("Heavy", { profile: { shape: "Fixed", points: [{ attribute: "FOR", points: 1 }, { attribute: "STR", points: 1 }, { attribute: "FOR", points: 1 }] } })] });
    expect(repeated.offers[0]!.offer.profile.points).toEqual([{ attribute: "FOR", points: 2 }, { attribute: "STR", points: 1 }]);
    expect(repeated.offers[0]!.problems).toEqual([]);
    expect(out.offers[0]!.offer.technique).toMatchObject({ actionEconomy: true, noBeat: true, hook: { kind: "clash", bonus: 10, side: "attack" } });
    expect(out.offers[1]!.problems).toEqual(["Breaker: a Fixed profile assigns 3 points, not 2"]);
    const gated = classOffersOf(engine, { offers: [offer("Counter", { technique: { ...offer("x").technique, effect: "+10 to a Clash, usable only if the supplies were counted at the last rest" } })] });
    expect(gated.offers[0]!.warnings).toEqual(['Counter\'s technique has a precondition: "usable only"']);
    expect(classOffersOf(engine, { offers: [offer("Restraint")] }).offers[0]!.warnings).toEqual(["Restraint names Restraint, a side of the Hidden Vector Engine"]);
    expect(out.offers[2]!.offer).toMatchObject({ name: "Witness", book: "Witness", profile: { shape: "Guided" } });
    expect(out.problems).toEqual(["two offers share a name", "Breaker carries a guarded power the GM did not ask for"]);
    expect(classOffersOf(engine, { offers: [offer("A"), offer("B")] }, { guarded: true }).problems).toEqual(["2 offers drafted; the System offers 3"]);
  });
});
