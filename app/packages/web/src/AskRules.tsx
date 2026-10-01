/**
 * Rules questions, on the GM's screen and each player's: a question answered from the book with
 * the chapter and heading each part comes from. The GM's reads every chapter; a player's reads the
 * players' chapters alone, and nothing from the campaign reaches it. Answers stay on the screen
 * that asked; nothing is recorded.
 */
import { useState } from "react";
import { askRules } from "./api.ts";
import { NEEDS_KEY, useAiConfigured } from "./gm/useAi.ts";
import { Icon } from "./ui.tsx";

interface Asked {
  question: string;
  answer: string;
  citations: { chapter: string; heading: string }[];
  inBook: boolean;
}

/**
 * With its heading (the GM's Rules section), the question and each answer are panels of their own;
 * `heading: false` where the surrounding fold already names it (the player's tray), a compact stack.
 */
export function AskRules({ campaignId, gm, className, heading = true }: { campaignId: string; gm?: boolean; className?: string; heading?: boolean }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<Asked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = useAiConfigured(campaignId);
  const ask = async () => {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const { answer } = await askRules(campaignId, q);
      setAsked([{ question: q, ...answer }, ...asked].slice(0, 10));
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const note = gm ? "Answered from every chapter of the book." : "Answered from the chapters players read.";
  // Without the campaign's key there is nothing to ask; the book stays the answer.
  const keyless = gm ? `Answering ${NEEDS_KEY}.` : "Answering needs the campaign's AI key, which the GM sets. Until then, the book has the answer.";
  const field = (
    <textarea
      className="textarea"
      rows={2}
      maxLength={1000}
      value={question}
      aria-label="Ask the rules"
      placeholder="Can I Yield against a free strike?"
      onChange={(e) => setQuestion(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void ask();
        }
      }}
    />
  );
  const button = (primary: boolean) => (
    <button className={primary ? "btn btn--primary" : "btn btn--sm"} type="button" disabled={busy || !question.trim() || !configured} onClick={ask}>
      {busy ? "Looking it up…" : "Ask"}
    </button>
  );
  const citations = (a: Asked) => a.citations.map((c) => `${c.chapter}, "${c.heading}"`).join("; ");
  const notInBook = `Not answered in ${gm ? "the book" : "the players' chapters"}: the GM's call.`;

  if (!heading)
    return (
      <section className={className ?? "stack ask-rules"}>
        <p className="small dim">{configured === false ? keyless : note}</p>
        {configured !== false && field}
        {configured !== false && <div>{button(false)}</div>}
        {error && <p className="error">{error}</p>}
        {asked.map((a, i) => (
          <div key={i} className="rules-answer">
            <p className="small">
              <strong>{a.question}</strong>
            </p>
            <p>{a.answer}</p>
            {a.citations.length > 0 && <p className="small dim">{citations(a)}</p>}
            {!a.inBook && <p className="small dim">{notInBook}</p>}
          </div>
        ))}
      </section>
    );

  return (
    <div className={className ?? "stack ask-panels"}>
      <section className="panel" aria-labelledby="ask-h">
        <div className="panel__head">
          <i className="ic ic-rules dim" aria-hidden="true" />
          <h2 id="ask-h">Ask the rules</h2>
          <span className="small dim">{note}</span>
        </div>
        <div className="panel__body stack ask-panels__form">
          {configured === false ? <p className="small dim">{keyless}</p> : field}
          {configured !== false && <div className="cluster">{button(true)}</div>}
          {error && <p className="error">{error}</p>}
        </div>
      </section>
      {asked.map((a, i) => (
        <article key={i} className="panel">
          <div className="panel__body stack ask-panels__answer">
            <h3>{a.question}</h3>
            <p className="prose">{a.answer}</p>
            {a.citations.length > 0 && (
              <p className="label cluster ask-panels__cited">
                <Icon name="rules" />
                {citations(a)}
              </p>
            )}
            {!a.inBook && (
              <div>
                <span className="tag tag--warn ask-panels__gm-call">
                  <Icon name="warning" />
                  {notInBook}
                </span>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
