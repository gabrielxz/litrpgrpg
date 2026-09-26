import { useState } from "react";
import { authConfig, devSignIn, signInWithGoogle } from "../auth.ts";

/** Google sign-in; on a development server, named test people as well. */
export function SignInButtons({ returnTo }: { returnTo?: string }) {
  const config = authConfig();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const google = Boolean(config?.supabaseUrl && config.supabasePublishableKey);

  return (
    <div className="sign-in">
      {google && (
        <button className="primary" onClick={() => signInWithGoogle(returnTo).catch((e) => setError(e.message))}>
          Sign in with Google
        </button>
      )}
      {config?.devSignIn && (
        <form
          className="dev-sign-in"
          onSubmit={(e) => {
            e.preventDefault();
            devSignIn(name).catch((err) => setError(err.message));
          }}
        >
          <label>
            Development sign-in
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of a test person" />
          </label>
          <button disabled={!name.trim()}>Sign in</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function SignIn() {
  return (
    <main className="page narrow center">
      <img src="/clave.svg" alt="" className="clave-large" />
      <h1>Gradebreaker</h1>
      <p className="muted">The companion for the tabletop game.</p>
      <SignInButtons />
    </main>
  );
}
