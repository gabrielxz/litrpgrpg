import { useEffect } from "react";

/**
 * The register a page is in, set on <body> so the whole viewport takes its ground: the GM's
 * console (`gm`, light or dark with the OS) or the player's System interface (`sys`).
 */
export type Register = "gm" | "sys";

export function useRegister(register: Register) {
  useEffect(() => {
    document.body.className = `gb ${register}`;
  }, [register]);
}
