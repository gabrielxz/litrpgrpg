import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Recordings, alignWords, disagree } from "../src/recordings.ts";

const at = (ms: number) => new Date(Date.parse("2026-10-01T18:00:00Z") + ms).toISOString();

/** A finished recording of one speaker: two seconds of audio and two heard lines. */
async function recorded() {
  let now = Date.parse("2026-10-01T18:00:00Z");
  const dir = mkdtempSync(join(tmpdir(), "gb-rec-"));
  const r = new Recordings({ dir, now: () => now });
  const m = r.start("c1", null, [{ userId: "u1", name: "Ana", role: "player" }]);
  for (let i = 0; i < 20; i++) {
    now += 100;
    r.write(m.id, "u1", Buffer.alloc(3200, i));
  }
  await r.stop(m.id, [
    { userId: "u1", startedAt: at(100), endedAt: at(900), text: "Kara swings the axe" } as never,
    { userId: "u1", startedAt: at(1200), endedAt: at(1900), text: "I yield to beats" } as never,
  ]);
  return { r, id: m.id, dir };
}

describe("correcting a test recording", () => {
  it("lays a second transcript's words on the speaker's lines and names where the two disagree", () => {
    const lines = [
      { id: "l1", speaker: "u1", text: "Kara swings the axe", startMs: 100, endMs: 900 },
      { id: "l2", speaker: "u1", text: "I yield to beats", startMs: 1200, endMs: 1900 },
      { id: "l3", speaker: "u2", text: "Not mine", startMs: 100, endMs: 900 },
    ];
    const heard = [
      { text: "Kara", startMs: 120, endMs: 300 },
      { text: "swings", startMs: 300, endMs: 500 },
      { text: "the", startMs: 500, endMs: 600 },
      { text: "axe.", startMs: 600, endMs: 880 },
      { text: "I", startMs: 1250, endMs: 1300 },
      { text: "yield", startMs: 1300, endMs: 1500 },
      { text: "two", startMs: 1500, endMs: 1600 },
      { text: "Beats.", startMs: 1600, endMs: 1880 },
      { text: "stray", startMs: 9000, endMs: 9200 },
    ];
    const aligned = alignWords(lines, "u1", heard);
    expect(aligned).toEqual(new Map([["l1", "Kara swings the axe."], ["l2", "I yield two Beats."]]));
    expect(disagree(lines[0]!.text, aligned.get("l1")!)).toBe(false);
    expect(disagree(lines[1]!.text, aligned.get("l2")!)).toBe(true);
  });

  it("keeps the heard text, writes the corrections, serves a line's audio, and runs the second opinion", async () => {
    const { r, id, dir } = await recorded();
    const snippet = r.snippet("c1", id, "u1", 100, 900)!;
    expect(snippet.subarray(0, 4).toString()).toBe("RIFF");
    expect(snippet.length).toBe(44 + (800 * 16000 * 2) / 1000);
    expect(r.snippet("c1", id, "../u1", 0, 100)).toBeNull();
    expect(r.snippet("c2", id, "u1", 0, 100)).toBeNull();

    expect(r.correct("c1", id, [{ id: "l2", text: "I yield two Beats." }])).toBe(1);
    expect(r.timeline("c1", id)!.lines[1]).toMatchObject({ text: "I yield two Beats.", checked: true });
    expect(JSON.parse(readFileSync(join(dir, id, "timeline.heard.json"), "utf8")).lines[1].text).toBe("I yield to beats");

    expect(r.secondState(id)).toBe("none");
    r.startSecond("c1", id, "test-model", async () => [{ text: "Kara", startMs: 150, endMs: 800 }]);
    expect(r.secondState(id)).toBe("running");
    await new Promise((done) => setTimeout(done, 20));
    expect(r.secondState(id)).toBe("done");
    expect(r.second("c1", id)).toEqual({ model: "test-model", lines: { l1: "Kara" } });
    expect(r.list("c1")[0]!.files.map((f) => f.name)).toEqual(["u1.wav", "timeline.json", "timeline.heard.json", "second.json"]);

    // Withdrawn consent takes the person's words from every copy.
    r.forget("c1", "u1");
    expect(r.timeline("c1", id)!.lines).toEqual([]);
    expect(JSON.parse(readFileSync(join(dir, id, "timeline.heard.json"), "utf8")).lines).toEqual([]);
    expect(r.second("c1", id)!.lines).toEqual({});
    expect(existsSync(join(dir, id, "u1.pcm"))).toBe(false);
  });

  it("says why a second opinion failed", async () => {
    const { r, id } = await recorded();
    r.startSecond("c1", id, "m", async () => {
      throw new Error("the upload was refused (401)");
    });
    await new Promise((done) => setTimeout(done, 20));
    expect(r.secondState(id)).toEqual({ failed: "the upload was refused (401)" });
  });
});
