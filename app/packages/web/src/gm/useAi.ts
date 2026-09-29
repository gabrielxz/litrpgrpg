import { useEffect, useState } from "react";
import { api } from "../api.ts";

/** Whether the campaign has a model key; null while asking. Drafting controls show only with one, and the manual form stays either way. */
export function useAiConfigured(campaignId: string): boolean | null {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    void api<{ configured: boolean }>("GET", `/campaigns/${campaignId}/ai`)
      .then((a) => setConfigured(a.configured))
      .catch(() => setConfigured(false));
  }, [campaignId]);
  return configured;
}
