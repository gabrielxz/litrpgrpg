import { GmCampaign } from "../gm/GmCampaign.tsx";
import { ListeningBar } from "../Listening.tsx";
import { useCampaign } from "../live.ts";
import { PlayerCampaign } from "../player/PlayerCampaign.tsx";
import { useRegister } from "../frame.ts";
import { TopBar } from "./Home.tsx";
import { guideFor } from "../guide/pages.ts";
import { useSyncExternalStore } from "react";

/** The GM's section, from the location's hash. */
function useHash(): string {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener("hashchange", l);
      return () => window.removeEventListener("hashchange", l);
    },
    () => window.location.hash.slice(1),
  );
}

export function Campaign({ id }: { id: string }) {
  const live = useCampaign(id);
  const { view, status, error } = live;
  const hash = useHash();

  useRegister(view?.role === "player" ? "sys" : "gm");

  const statusLine = (
    <span className="topbar__campaign">
      {view?.campaign.name}
      <i className={status === "live" ? "live" : "live live--off"} title={status === "live" ? "Live" : "Reconnecting"} />
    </span>
  );

  if (error)
    return (
      <>
        <TopBar />
        <main className="page narrow">
          <p className="error">{error}</p>
        </main>
      </>
    );
  if (!view)
    return (
      <>
        <TopBar />
        <p className="loading">Connecting…</p>
      </>
    );
  return (
    <>
      <TopBar guide={guideFor({ role: view.role === "gm" ? "gm" : "player", section: hash || undefined })}>{statusLine}</TopBar>
      {view.role !== "gm" && <ListeningBar campaignId={id} role={view.role} status={live.listening} send={live.send} />}
      {view.role === "gm" ? <GmCampaign view={view} live={live} /> : <PlayerCampaign view={view} />}
    </>
  );
}
