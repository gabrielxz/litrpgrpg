/** Paths: `/`, `/c/:campaignId`, `/join/:code`. History API only; the server serves the app for any path. */
import { type MouseEvent, type ReactNode, useSyncExternalStore } from "react";

export function navigate(path: string) {
  if (path === window.location.pathname) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(): string {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener("popstate", l);
      return () => window.removeEventListener("popstate", l);
    },
    () => window.location.pathname,
  );
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const go = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={go} className={className}>
      {children}
    </a>
  );
}
