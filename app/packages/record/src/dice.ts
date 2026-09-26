/**
 * Rolling d100 the book's way (Core Mechanics, "System Volatility"): when the natural die
 * meets the roller's Volatility Threshold, another d100 is added, and each new die can do the
 * same. With Advantage two dice are rolled and only the kept one explodes. The randomness is
 * passed in, so the server can use a cryptographic source and the tests a fixed sequence.
 */
export type D100 = () => number;

export interface Dice {
  /** The kept die and every die it exploded into. */
  natural: number[];
  /** With Advantage, the lower die. */
  dropped?: number;
}

export function rollD100s(threshold: number, opts: { advantage?: boolean; explodes?: boolean }, d100: D100): Dice {
  let first = d100();
  let dropped: number | undefined;
  if (opts.advantage) {
    const second = d100();
    dropped = Math.min(first, second);
    first = Math.max(first, second);
  }
  const natural = [first];
  if (opts.explodes !== false) {
    while (natural[natural.length - 1]! >= threshold) natural.push(d100());
  }
  return dropped === undefined ? { natural } : { natural, dropped };
}
