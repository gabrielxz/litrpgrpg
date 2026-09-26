/**
 * The rules engine: a calculator over one rules snapshot (the parsed `rules/*.yaml`).
 *
 * A port of `tools/rules_engine.py`, function for function. Every constant comes from the
 * snapshot, and every function implements a procedure the book states. Where the book is
 * silent the function throws RulesGap, the signal to write the answer into the book first.
 * The fixtures under `rules/fixtures/` are the contract both engines meet
 * (`test/fixtures.test.ts` runs them here).
 *
 * Method names are the Python names in camelCase; results keep the Python keys, which are
 * the fixtures' keys. The engine holds no state and does no I/O: a campaign builds one from
 * the snapshot of the rules version it pins.
 */

// The snapshot is untyped YAML; each method reads the keys its Python twin reads.
export type RulesSnapshot = Record<string, any>;

export class RulesGap extends Error {
  override name = "RulesGap";
}
export class ValueError extends Error {
  override name = "ValueError";
}
export class KeyError extends Error {
  override name = "KeyError";
}

export const ATTRIBUTES = ["STR", "DEX", "FOR", "HRT", "POW", "PER", "CHA"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Stats = Record<string, number>;

/** Python's `//`: floor division. */
const floorDiv = (a: number, b: number): number => Math.floor(a / b);

export class Engine {
  /** The snapshot this engine computes over, for callers that read a procedure's constants directly. */
  readonly rules: RulesSnapshot;

  constructor(rules: RulesSnapshot) {
    this.rules = rules;
  }

  private load(name: string) {
    const doc = this.rules[name];
    if (doc === undefined) throw new KeyError(`no rules file ${name}`);
    return doc;
  }

  version(): string {
    return this.load("version").version;
  }

  // ------------------------------------------------------------ grades ---

  grade(code: string) {
    for (const g of this.load("grades").grades) {
      if (g.code === code.toUpperCase()) return g;
    }
    throw new KeyError(`no Grade ${code}`);
  }

  gradeOrder(code: string): number {
    return this.grade(code).order;
  }

  /** ×10 per Grade above F. */
  scale(code: string): number {
    return this.load("grades").scale_per_grade ** this.gradeOrder(code);
  }

  /** Raw divided by the Grade's divisor, fractions dropped. Lagging stats read the same way. */
  force(raw: number, code: string): number {
    return floorDiv(raw, this.grade(code).divisor);
  }

  damageMultiplier(code: string): number {
    return this.grade(code).damage_multiplier;
  }

  statCap(code: string): number {
    return this.grade(code).raw_max;
  }

  crossGradeAdjustment(higher: string, lower: string): number {
    const gap = this.gradeOrder(higher) - this.gradeOrder(lower);
    if (gap < 0) throw new ValueError("higher must be the higher Grade");
    return gap * this.load("grades").cross_grade_adjustment_per_grade;
  }

  volatilityThreshold(code: string): number {
    return this.grade(code).volatility_threshold;
  }

  volatilityProbabilityPercent(code: string): number {
    return 101 - this.volatilityThreshold(code);
  }

  /** Total a cascade of natural results. Every die but the last must have met the threshold. */
  explode(naturalDice: number[], code: string) {
    const t = this.volatilityThreshold(code);
    for (const d of naturalDice.slice(0, -1)) {
      if (d < t) throw new ValueError(`die ${d} did not meet the ${code} threshold ${t}, so it cannot have cascaded`);
    }
    const extra = naturalDice.length - 1;
    return {
      total: naturalDice.reduce((a, b) => a + b, 0),
      extra_dice: extra,
      battle_memory: extra >= this.load("grades").volatility.battle_memory_cascade_dice,
    };
  }

  // --------------------------------------------------------- character ---

  maxHp(rawFor: number): number {
    return rawFor * 2;
  }

  maxAether(rawPow: number): number {
    return rawPow;
  }

  surgeCost(maxAetherValue: number): number {
    return Math.max(1, floorDiv(maxAetherValue, 2));
  }

  /** Total stat points from creation plus per-level budget at F-Grade (no class bonus, no titles or treasures). */
  pointsByLevel(level: number): number {
    const c = this.load("character");
    return c.point_buy.points + (level - 1) * c.leveling.points_per_level;
  }

  proficiencyBonus(tier: string): number {
    const p = this.load("character").proficiencies;
    for (const t of p.tiers) if (t.name === tier) return t.bonus;
    if (tier.toLowerCase() === "untrained") return p.untrained_bonus;
    throw new KeyError(tier);
  }

  /** The tier a Proficiency has reached (untrained before its first Mark); Master needs an E-Grade body. */
  tierForMarks(marks: number, bodyGrade = "F"): string {
    let reached = "untrained";
    for (const t of this.load("character").proficiencies.tiers) {
      if (marks >= t.marks_required) {
        const req = t.requires_grade;
        if (req && this.gradeOrder(bodyGrade) < this.gradeOrder(req)) break;
        reached = t.name;
      }
    }
    return reached;
  }

  pregen(name: string) {
    for (const p of this.load("character").pregens) {
      if (p.name.toLowerCase() === name.toLowerCase()) return p;
    }
    throw new KeyError(name);
  }

  pregenDerived(name: string) {
    const p = this.pregen(name);
    const s: Stats = p.stats;
    return {
      points: Object.values(s).reduce((a, b) => a + b, 0),
      max_hp: this.maxHp(s.FOR!),
      max_aether: this.maxAether(s.POW!),
      tolerance: this.tolerance(p.grade),
      bands: this.saturationThresholds(p.grade),
      surge_cost: this.surgeCost(this.maxAether(s.POW!)),
    };
  }

  /** The Momentum roller's bonus: nerve or awareness, whichever is higher. */
  momentumValue(hrtForce: number, perForce: number): number {
    return Math.max(hrtForce, perForce);
  }

  // -------------------------------------------------------- resolution ---

  resistance(difficulty: string): number {
    for (const row of this.load("resolution").resistance_card) {
      if (row.difficulty.toLowerCase() === difficulty.toLowerCase()) return row.resistance;
    }
    throw new KeyError(difficulty);
  }

  /** The number the challenger's d100 + Force must meet. The Cross-Grade Adjustment lands on whichever side is higher. */
  effectiveResistance(difficulty: string, obstacleGrade = "F", challengerGrade = "F"): number {
    const gap = this.gradeOrder(obstacleGrade) - this.gradeOrder(challengerGrade);
    return this.resistance(difficulty) + gap * this.load("grades").cross_grade_adjustment_per_grade;
  }

  /** Force alone (with the Adjustment) meets the Resistance: no roll. Two or more Grades above never rolls. */
  autoSuccess(forceValue: number, difficulty: string, obstacleGrade = "F", challengerGrade = "F"): boolean {
    const gap = this.gradeOrder(challengerGrade) - this.gradeOrder(obstacleGrade);
    if (gap >= this.load("resolution").auto_success.never_rolls_at_grade_gap) return true;
    return forceValue >= this.effectiveResistance(difficulty, obstacleGrade, challengerGrade);
  }

  /**
   * success / exceptional / soft / hard / catastrophic, for checks. `natural` is the first die;
   * the total already includes any explosion. A check whose die exploded and succeeds is exceptional.
   */
  checkOutcome(total: number, target: number, natural: number, code = "F"): string {
    const r = this.load("resolution");
    const [catLo, catHi] = r.failure_tiers.catastrophic_natural;
    if (catLo <= natural && natural <= catHi) return "catastrophic";
    const exploded = natural >= this.volatilityThreshold(code);
    if (total >= target) return exploded ? "exceptional" : "success";
    return target - total >= r.failure_tiers.hard.fail_by_min ? "hard" : "soft";
  }

  /** Nothing presses: the check succeeds without a roll if a natural 100 would succeed. */
  take100(forceValue: number, difficulty: string, modifiers = 0, obstacleGrade = "F", challengerGrade = "F"): boolean {
    return forceValue + 100 + modifiers >= this.effectiveResistance(difficulty, obstacleGrade, challengerGrade);
  }

  /** Advantage: roll two d100, keep the higher. Only the kept die can explode. */
  withAdvantage(dieA: number, dieB: number): number {
    return Math.max(dieA, dieB);
  }

  // ------------------------------------------------------------ combat ---

  /** One Clash. Dice are the totals after any explosion. The higher Grade adds the Adjustment; damage uses the attacker's multiplier. */
  clash(
    attDie: number,
    attForce: number,
    defDie: number,
    defForce: number,
    attGrade = "F",
    defGrade = "F",
    attMods = 0,
    defMods = 0,
  ) {
    const gap = this.gradeOrder(attGrade) - this.gradeOrder(defGrade);
    const adj = Math.abs(gap) * this.load("grades").cross_grade_adjustment_per_grade;
    const attTotal = attDie + attForce + attMods + (gap > 0 ? adj : 0);
    const defTotal = defDie + defForce + defMods + (gap < 0 ? adj : 0);
    const margin = attTotal - defTotal;
    const r40 = this.load("resolution").rule_of_40;
    const attackerWins = margin >= 0; // a tie goes to the attacker
    return {
      attacker_total: attTotal,
      defender_total: defTotal,
      margin,
      attacker_wins: attackerWins,
      damage: attackerWins && margin > 0 ? margin * this.damageMultiplier(attGrade) : 0,
      driven_back: attackerWins && margin >= r40.driven_back_margin,
      turned_aside: !attackerWins && -margin >= r40.turned_aside_margin,
    };
  }

  yieldMargin(margin: number, beats: number, cornered = false): number {
    const y = this.load("combat").yield;
    const cap = cornered ? y.cornered_max_beats : y.max_beats;
    if (beats > cap) throw new ValueError(`only ${cap} Beat(s) can be given up here`);
    return Math.max(0, margin - beats * y.margin_reduction_per_beat);
  }

  damageAfterYield(margin: number, beats: number, attGrade = "F", cornered = false): number {
    return this.yieldMargin(margin, beats, cornered) * this.damageMultiplier(attGrade);
  }

  annihilated(damage: number, maxHpValue: number): boolean {
    return damage >= this.load("combat").downed.annihilation_multiple_of_max_hp * maxHpValue;
  }

  /** The Will Save is a Heart check: d100 + HRT Force. */
  auraSaveTotal(die: number, hrtForce: number): number {
    return die + hrtForce;
  }

  auraResistance(flaring = false): number {
    const a = this.load("combat").aura_pressure;
    return flaring ? a.resistance_flaring : a.resistance_calm;
  }

  // ------------------------------------------------------- cultivation ---

  tolerance(code = "F"): number {
    return this.load("cultivation").tolerance.base * this.scale(code);
  }

  saturationThresholds(code = "F"): number[] {
    const t = this.tolerance(code);
    return this.load("cultivation").saturation.bands.map((b: { past_multiple: number }) => t * b.past_multiple);
  }

  /** The band a stored total sits in. "Past" is strictly greater than. */
  saturation(storedVe: number, code = "F") {
    const t = this.tolerance(code);
    let band = "None";
    let penalty = 0;
    let clock = false;
    for (const b of this.load("cultivation").saturation.bands) {
      if (storedVe > t * b.past_multiple) {
        band = b.name;
        penalty = b.penalty;
        clock = Boolean(b.collapse_clock);
      }
    }
    return { band, penalty, collapse_clock: clock };
  }

  refineRate(code = "F", highDensity = false): number {
    const c = this.load("cultivation").consolidation;
    return (highDensity ? c.refine_per_hour_high_density : c.refine_per_hour) * this.scale(code);
  }

  /** Full hours to refine a stored total. Minimum one hour. */
  refineHours(storedVe: number, code = "F", highDensity = false): number {
    const min = this.load("cultivation").consolidation.minimum_hours;
    if (storedVe <= 0) return min;
    return Math.max(min, Math.ceil(storedVe / this.refineRate(code, highDensity)));
  }

  levelCost(code = "F"): number {
    return this.load("cultivation").level_cost.base * this.scale(code);
  }

  /** VE refined from Level 1 to reach the given F-Grade level (the first level is free). */
  cumulativeVeToLevel(level: number): number {
    if (!(level >= 1 && level <= this.load("grades").levels_per_grade)) {
      throw new RulesGap("cumulative cost past the F-Grade cap runs through a Breakthrough");
    }
    return (level - 1) * this.levelCost("F");
  }

  levelsFromVe(unrefinedVe: number, code = "F"): number {
    return floorDiv(unrefinedVe, this.levelCost(code));
  }

  killTierMultiple(tier: string): number {
    for (const row of this.load("cultivation").awards.kill_tiers) {
      if (row.difficulty.toLowerCase() === tier.toLowerCase()) return row.multiple;
    }
    throw new KeyError(tier);
  }

  /** The victim's tier within its own Grade, as a multiple of the killer's Peer Kill, ×10 per Grade the victim sits above. */
  killVe(tier: string, killerGrade = "F", victimGrade = "F"): number {
    const aw = this.load("cultivation").awards;
    const gap = this.gradeOrder(victimGrade) - this.gradeOrder(killerGrade);
    if (gap < 0) return aw.sub_grade_kill;
    const peer = aw.peer_kill * this.scale(killerGrade);
    return Math.trunc(peer * this.killTierMultiple(tier) * this.load("grades").scale_per_grade ** gap);
  }

  questVe(category: string, difficulty: string): number | null {
    const keys: Record<string, string> = {
      routine: "routine",
      "personal opportunity": "personal_opportunity",
      hidden: "personal_opportunity",
      mandate: "mandate",
      faction: "faction",
    };
    const key = keys[category.toLowerCase()];
    if (key === undefined) throw new KeyError(category);
    for (const row of this.load("quests").ve_rewards) {
      if (row.difficulty.toLowerCase() === difficulty.toLowerCase()) return row[key] ?? null;
    }
    throw new KeyError(difficulty);
  }

  /** A sizing row's creature Force (Level 8 and up) adjusted for a party other than four. */
  sizedForce(rowForce: number, partySize: number): number {
    const g = this.load("bestiary").encounter_guidance;
    return rowForce + g.force_per_character * (partySize - g.party_size_written_for);
  }

  // ------------------------------------------------------ breakthrough ---

  /** The Breakthrough Check bonus for a location's Energy Density tier. */
  energyDensityBonus(tier: string): number {
    for (const row of this.load("breakthrough").energy_density) {
      if (row.tier.toLowerCase() === tier.toLowerCase()) return row.bonus;
    }
    throw new KeyError(tier);
  }

  overchargeRow(ratio: number) {
    for (const row of this.load("breakthrough").overcharge) {
      if (row.ratio === ratio) return row;
    }
    throw new KeyError(String(ratio));
  }

  breakthroughDc(overchargeRatio = 1): number {
    return this.load("breakthrough").check.dc + this.overchargeRow(overchargeRatio).dc_modifier;
  }

  overchargeVe(overchargeRatio: number, code = "F"): number {
    return this.tolerance(code) * overchargeRatio;
  }

  /** What every Attribute gains on a Stable or better Breakthrough out of `fromCode` (10 at F→E, ×10 per Grade). */
  breakthroughAttributeGain(fromCode = "F"): number {
    return this.load("breakthrough").outputs.Stable.every_attribute_adds * this.scale(fromCode);
  }

  /** A Raw Attribute after Breaking Through out of `fromCode`: the caps lift, no floor is imposed. */
  postBreakthroughRaw(raw: number, fromCode = "F"): number {
    return raw + this.breakthroughAttributeGain(fromCode);
  }

  qualityTier(total: number, overchargeRatio = 1, qualityEnhancer = false) {
    const b = this.load("breakthrough");
    const dc = this.breakthroughDc(overchargeRatio);
    const margin = total - dc;
    const tiers = b.quality_tiers;
    const names: string[] = tiers.map((t: { tier: string }) => t.tier);
    let idx = 0;
    tiers.forEach((t: { margin_min: number | null; margin_max: number | null }, i: number) => {
      const lo = t.margin_min ?? -1e9;
      const hi = t.margin_max ?? 1e9;
      if (lo <= margin && margin <= hi) idx = i;
    });
    if (margin < 0) return { dc, margin, tier: names[0], success: false };
    idx += b.tier_adjustment.overcharge_steps[overchargeRatio - 1];
    if (qualityEnhancer) idx += b.tier_adjustment.quality_enhancer_steps;
    idx = Math.min(idx, names.length - 1);
    return { dc, margin, tier: names[idx], success: true };
  }

  anchorBonus(margin: number): number {
    const a = this.load("breakthrough").anchor;
    if (margin < 0) return 0;
    if (margin >= 40) return a.bonus_at_margin_40;
    if (margin >= 20) return a.bonus_at_margin_20;
    return a.bonus_on_success;
  }

  /** deepLeads: for each axis, how far the leading side of Deep is ahead of the other. */
  coherence(deepLeads: number[]) {
    const th = this.load("hve").coherence_thresholds;
    const leads = deepLeads.map(Math.abs).sort((a, b) => b - a);
    const top = leads[0];
    let profile: string;
    if (top !== undefined && top >= th.singular) profile = "Singular";
    else if (top !== undefined && (top >= th.defined || leads.filter((x) => x >= th.defined_two_sides).length >= 2))
      profile = "Defined";
    else if (top !== undefined && top >= th.leaning) profile = "Leaning";
    else profile = "Scattered";
    return { profile, bonus: this.load("breakthrough").coherence_bonus[profile] as number };
  }

  // --------------------------------------------------------------- hve ---

  /** One axis. current and deep map the two pole names to tallies. Returns the new Deep and a wiped Current. */
  sweepUpdate(current: Record<string, number>, deep: Record<string, number>) {
    const s = this.load("hve").sweep.deep_update;
    const [[a, ca], [b, cb]] = Object.entries(current) as [[string, number], [string, number]];
    const newDeep = { ...deep };
    if (ca - cb >= s.current_lead_required) newDeep[a] = (newDeep[a] ?? 0) + s.deep_tally_added;
    else if (cb - ca >= s.current_lead_required) newDeep[b] = (newDeep[b] ?? 0) + s.deep_tally_added;
    return { deep: newDeep, current: { [a]: 0, [b]: 0 } };
  }

  /**
   * One axis. Structured logging records events; at session end the sweep is computed from them:
   * sum each entry's intensity by side into Current, then apply the sweep's Deep update and wipe Current.
   * A 0.5 entry is a reminder and adds nothing; the GM raises it to 1.0 to count it (rules 0.1.16).
   */
  structuredSweep(entries: { side: string; intensity: number }[], poles: string[], deep: Record<string, number>) {
    const sl = this.load("hve").structured_logging;
    const current: Record<string, number> = Object.fromEntries(poles.map((p) => [p, 0]));
    for (const e of entries) {
      current[e.side] = (current[e.side] ?? 0) + (e.intensity === sl.intensities.below_threshold ? sl.half_tier_counts_as : e.intensity);
    }
    return this.sweepUpdate(current, deep);
  }

  // -------------------------------------------------------- principles ---

  principleTier(ip: number): string | null {
    let reached: string | null = null;
    for (const row of this.load("principles").ladder) {
      if (ip >= row.cumulative_ip) reached = row.tier;
    }
    return reached;
  }

  applicationCost(grantedAt: string): number {
    for (const row of this.load("principles").application_costs) {
      if (row.granted_at.toLowerCase().startsWith(grantedAt.toLowerCase())) return row.aether;
    }
    throw new KeyError(grantedAt);
  }

  applicationUses(maxAetherValue: number, grantedAt: string): number {
    const cost = this.applicationCost(grantedAt);
    if (cost === 0) throw new RulesGap("Infusion costs nothing; uses are not a number");
    return floorDiv(maxAetherValue, cost);
  }

  skillCostAtGrade(costAtF: number, acquiredGrade: string): number {
    return costAtF * this.scale(acquiredGrade);
  }

  // ----------------------------------------------------------- classes ---

  /** Added to the class's lead Attribute at Level 10, before the level's own points land. */
  classSelectionBonus(): number {
    return this.load("classes").selection.lead_attribute_bonus;
  }

  classSelect(stats: Stats, lead: string): Stats {
    return { ...stats, [lead]: (stats[lead] ?? 0) + this.classSelectionBonus() };
  }

  classProfileShape(shape: string): { system: number; returned: number } {
    for (const s of this.load("classes").profile.shapes) {
      if (s.shape.toLowerCase() === shape.toLowerCase()) return { system: s.system, returned: s.returned };
    }
    throw new KeyError(shape);
  }

  classTechniqueBonusCap(): number {
    return this.load("classes").technique.bonus_cap;
  }

  /** 5 Aether at F, ×10 per Grade of acquisition, like any acquired skill. */
  classTechniqueCost(acquiredGrade = "F"): number {
    return this.load("classes").technique.aether_cost_at_f * this.scale(acquiredGrade);
  }

  classTechniqueUses(maxAetherValue: number, acquiredGrade = "F"): number {
    return floorDiv(maxAetherValue, this.classTechniqueCost(acquiredGrade));
  }

  /**
   * Apply `levels` class levels: the profile's System points every level, and the player's free
   * points (2 a level plus whatever the profile returns) as one total.
   */
  classGrowth(stats: Stats, profile: Stats, freeTotal: Stats, levels: number): Stats {
    const perLevel = this.load("classes").profile.system_points_per_level;
    const sum = (o: Stats) => Object.values(o).reduce((a, b) => a + b, 0);
    const system = sum(profile);
    if (system < 1 || system > perLevel) throw new ValueError(`a profile places 1 to ${perLevel} System points, not ${system}`);
    const freePerLevel = this.load("character").leveling.free + (perLevel - system);
    if (sum(freeTotal) !== freePerLevel * levels) {
      throw new ValueError(`free points must total ${freePerLevel * levels} over ${levels} levels, not ${sum(freeTotal)}`);
    }
    const out = { ...stats };
    for (const [attr, pts] of Object.entries(profile)) out[attr] = (out[attr] ?? 0) + pts * levels;
    for (const [attr, pts] of Object.entries(freeTotal)) out[attr] = (out[attr] ?? 0) + pts;
    return out;
  }

  // ------------------------------------------------------------- items ---

  /** Only a pill of the body's own Grade works; it heals the listed amount ×10 per Grade. */
  pillEffect(listedAmount: number, pillGrade: string, bodyGrade: string): number {
    if (this.gradeOrder(pillGrade) !== this.gradeOrder(bodyGrade)) return 0;
    return listedAmount * this.scale(pillGrade);
  }

  weaponBonus(tier: string): number {
    return this.proficiencyBonus(tier);
  }
}

export { SIGNATURES } from "./signatures.ts";
