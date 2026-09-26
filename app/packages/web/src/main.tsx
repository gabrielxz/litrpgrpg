import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { initAuth } from "./auth.ts";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

initAuth()
  .then(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
  .catch((e) => root.render(<p className="fatal">The server did not answer: {String(e.message ?? e)}</p>));
