import { useEffect, useState } from "react";
import { api } from "../api.ts";

/** Where a control that needs the key points the GM. */
export const NEEDS_KEY = "needs the campaign's key (the AI card in the Table section)";

/**
 * Whether the campaign has a model key; null while asking. Drafting controls show only with one,
 * and the manual form stays either way. Any member may ask, so a player's screen uses it too.
 */
export function useAiConfigured(campaignId: string): boolean | null {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    void api<{ configured: boolean }>("GET", `/campaigns/${campaignId}/ai/configured`)
      .then((a) => setConfigured(a.configured))
      .catch(() => setConfigured(false));
  }, [campaignId]);
  return configured;
}
