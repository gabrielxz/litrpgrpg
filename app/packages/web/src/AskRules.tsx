/**
 * Rules questions, on the GM's screen and each player's: a question answered from the book with
 * the chapter and heading each part comes from. The GM's reads every chapter; a player's reads the
 * players' chapters alone, and nothing from the campaign reaches it. Answers stay on the screen
 * that asked; nothing is recorded.
 */
import { useState } from "react";
import { askRules } from "./api.ts";

interface Asked {
  question: string;
  answer: string;
  citations: { chapter: string; heading: string }[];
  inBook: boolean;
}

export function AskRules({ campaignId, gm, className }: { campaignId: string; gm?: boolean; className?: string }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<Asked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  return (
    <section className={className ?? "table-dice"}>
      <h3>Ask the rules</h3>
      <p className="small sys-dim">{gm ? "Answered from every chapter of the book." : "Answered from the chapters players read."}</p>
      <textarea
        rows={2}
        maxLength={1000}
        value={question}
        placeholder="Can I Yield against a free strike?"
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void ask();
          }
        }}
      />
      <button disabled={busy || !question.trim()} onClick={ask}>
        {busy ? "Looking it up…" : "Ask"}
      </button>
      {error && <p className="error">{error}</p>}
      {asked.map((a, i) => (
        <div key={i} className="rules-answer">
          <p className="small">
            <strong>{a.question}</strong>
          </p>
          <p>{a.answer}</p>
          {a.citations.length > 0 && <p className="small sys-dim">{a.citations.map((c) => `${c.chapter}, "${c.heading}"`).join("; ")}</p>}
          {!a.inBook && <p className="small sys-dim">Not answered in {gm ? "the book" : "the players' chapters"}: the GM's call.</p>}
        </div>
      ))}
    </section>
  );
}
