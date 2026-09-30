import { useAuth } from "./auth.ts";
import { Campaign } from "./pages/Campaign.tsx";
import { Guide } from "./pages/Guide.tsx";
import { Home } from "./pages/Home.tsx";
import { Join } from "./pages/Join.tsx";
import { SignIn } from "./pages/SignIn.tsx";
import { usePath } from "./router.tsx";

export function App() {
  const auth = useAuth();
  const path = usePath();
  const join = /^\/join\/([^/]+)$/.exec(path);
  const campaign = /^\/c\/([^/]+)$/.exec(path);
  const guide = /^\/guide(?:\/([^/]+))?\/?$/.exec(path);

  if (guide) return <Guide id={guide[1] && decodeURIComponent(guide[1])} />;

  if (auth.status === "loading") return <p className="loading">Loading…</p>;
  if (join) return <Join code={decodeURIComponent(join[1]!)} />;
  if (auth.status === "signed-out") return <SignIn />;
  if (campaign) return <Campaign id={decodeURIComponent(campaign[1]!)} />;
  return <Home />;
}
