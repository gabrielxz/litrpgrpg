import { useEffect, useState } from "react";
import { ApiError, api } from "../api.ts";
import { useAuth } from "../auth.ts";
import { navigate } from "../router.tsx";
import { SignInButtons } from "./SignIn.tsx";

/** An invite link: see the campaign's name, sign in if needed, join. */
export function Join({ code }: { code: string }) {
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
    <main className="page narrow center">
      <img src="/clave.svg" alt="" className="clave-large" />
      {error && <p className="error">{error}</p>}
      {invite && (
        <>
          <h1>{invite.campaignName}</h1>
          {!invite.usable ? (
            <p className="muted">This invite can no longer be used. Ask your GM for a new link.</p>
          ) : auth.status === "signed-in" ? (
            <>
              <p className="muted">You are joining as {auth.user?.displayName}, as a player.</p>
              <button className="primary" disabled={busy} onClick={join}>
                Join the campaign
              </button>
            </>
          ) : (
            <>
              <p className="muted">Sign in to join as a player.</p>
              <SignInButtons returnTo={window.location.href} />
            </>
          )}
        </>
      )}
    </main>
  );
}
