/**
 * The user guide (app/DESIGN.md, M4): open to anyone, signed in or not, at `/guide/<page>`. Every
 * screen's top bar links here, to the page for where the reader is, in a tab of its own.
 */
import { useEffect } from "react";
import { useRegister } from "../frame.ts";
import { Markdown } from "../guide/markdown.tsx";
import { GROUPS, PAGES, SHOT_BASE } from "../guide/pages.ts";
import { Link, navigate } from "../router.tsx";

export function Guide({ id }: { id: string | undefined }) {
  useRegister("gm");
  const page = PAGES.get(id ?? "start") ?? PAGES.get("start");
  useEffect(() => {
    document.title = page ? `${page.title} · Gradebreaker guide` : "Gradebreaker guide";
    window.scrollTo(0, 0);
  }, [page]);
  return (
    <>
      <header className="topbar">
        <Link to="/" className="topbar__mark">
          <i className="clave" aria-hidden="true" />
          <span className="wordmark">Gradebreaker</span>
        </Link>
        <span className="topbar__campaign">Guide</span>
      </header>
      <div className="guide">
        <nav className="guide__contents" aria-label="The guide's pages">
          {GROUPS.map((g) => (
            <div key={g.label} className="stack guide__group">
              <span className="label">{g.label}</span>
              <ul>
                {g.ids.flatMap((pid) => {
                  const p = PAGES.get(pid);
                  if (!p) return [];
                  return [
                    <li key={pid}>
                      <Link to={`/guide/${pid}`} className="guide__link" current={p.id === page?.id}>
                        {p.title}
                      </Link>
                    </li>,
                  ];
                })}
              </ul>
            </div>
          ))}
        </nav>
        <article className="guide__page">
          {page ? (
            <>
              <h1>{page.title}</h1>
              <Markdown blocks={page.blocks} shotBase={SHOT_BASE} onLink={navigate} />
            </>
          ) : (
            <p className="dim">The guide has no pages yet.</p>
          )}
        </article>
      </div>
    </>
  );
}
