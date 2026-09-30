import { useRegister } from "../frame.ts";
import { useEffect, useState } from "react";
import { ApiError, api } from "../api.ts";
import { useAuth } from "../auth.ts";
import { navigate } from "../router.tsx";
import { SignInButtons } from "./SignIn.tsx";
import { TopBar } from "./Home.tsx";
import { Clave } from "../ui.tsx";

/** An invite link: see the campaign's name, sign in if needed, join. */
export function Join({ code }: { code: string }) {
  useRegister("gm");
  const auth = useAuth();
  const [invite, setInvite] = useState<{ campaignName: string; usable: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ campaignName: string; usable: boolean }>("GET", `/invites/${encodeURIComponent(code)}`)
      .then(setInvite)
      .catch((e: ApiError) => setError(e.status === 404 ? "This invite link does not exist." : e.message));
  }, [code]);

  const join = async () => {
    setBusy(true);
    try {
      const r = await api<{ campaignId: string }>("POST", `/invites/${encodeURIComponent(code)}/accept`);
      navigate(`/c/${r.campaignId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      {auth.status === "signed-in" && <TopBar />}
      <main className="arrive arrive--join">
        <img className="arrive__art" src="/art/office-bone-portrait.webp" alt="" />
        <div className="stack arrive__stack">
          <Clave style={{ width: "2.5rem", height: "2.95rem" }} />
          {error && <p className="error">{error}</p>}
          {invite && (
            <>
              <h1 className="arrive__campaign">{invite.campaignName}</h1>
              {!invite.usable ? (
                <p className="dim arrive__line">This invite can no longer be used. Ask your GM for a new link.</p>
              ) : auth.status === "signed-in" ? (
                <>
                  <p className="dim arrive__line">You are joining as {auth.user?.displayName}, as a player.</p>
                  <div>
                    <button className="btn btn--primary arrive__go" disabled={busy} onClick={join}>
                      Join the campaign
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="dim arrive__line">Sign in to join as a player.</p>
                  <SignInButtons returnTo={window.location.href} />
                  <a className="small dim" href="/guide/start" target="_blank" rel="noreferrer">
                    Guide
                  </a>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
