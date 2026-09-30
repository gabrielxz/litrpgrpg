import { useRegister } from "../frame.ts";
import { useState } from "react";
import { authConfig, devSignIn, signInWithGoogle } from "../auth.ts";
import { Clave } from "../ui.tsx";

/** Google sign-in; on a development server, named test people as well. */
export function SignInButtons({ returnTo }: { returnTo?: string }) {
  const config = authConfig();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const google = Boolean(config?.supabaseUrl && config.supabasePublishableKey);

  return (
    <div className="stack sign-in">
      {google && (
        <button className="btn btn--primary sign-in__google" onClick={() => signInWithGoogle(returnTo).catch((e) => setError(e.message))}>
          Sign in with Google
        </button>
      )}
      {google && config?.devSignIn && <hr className="rule" />}
      {config?.devSignIn && (
        <form
          className="stack sign-in__dev"
          onSubmit={(e) => {
            e.preventDefault();
            devSignIn(name).catch((err) => setError(err.message));
          }}
        >
          <label className="field">
            <span>Development sign-in</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of a test person" />
          </label>
          <div>
            <button className="btn" disabled={!name.trim()}>
              Sign in
            </button>
          </div>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function SignIn() {
  useRegister("gm");
  return (
    <main className="arrive">
      <img className="arrive__art" src="/art/office-bone.webp" alt="" />
      <div className="arrive__column">
        <div className="stack arrive__stack">
          <Clave style={{ width: "3rem", height: "3.55rem" }} />
          <div className="stack arrive__title">
            <h1 className="wordmark arrive__wordmark">Gradebreaker</h1>
            <p className="dim arrive__line">The companion for the tabletop game.</p>
          </div>
          <SignInButtons />
        </div>
      </div>
    </main>
  );
}
