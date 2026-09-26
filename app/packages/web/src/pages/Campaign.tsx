import { GmCampaign } from "../gm/GmCampaign.tsx";
import { useCampaign } from "../live.ts";
import { PlayerCampaign } from "../player/PlayerCampaign.tsx";
import { TopBar } from "./Home.tsx";

export function Campaign({ id }: { id: string }) {
  const live = useCampaign(id);
  const { view, status, error } = live;

  const statusLine = (
    <span className={`live-status ${status}`}>
      {view?.campaign.name}
      <span className="dot" title={status === "live" ? "Live" : "Reconnecting"} />
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
      <TopBar>{statusLine}</TopBar>
      {view.role === "gm" ? <GmCampaign view={view} live={live} /> : <PlayerCampaign view={view} notices={live.notices} />}
    </>
  );
}
