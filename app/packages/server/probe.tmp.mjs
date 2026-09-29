import Anthropic from "@anthropic-ai/sdk";
const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
try { await c.messages.create({ model: "claude-opus-5-5", max_tokens: 1, messages: [{ role: "user", content: "ok" }] }); console.log("up"); } catch (e) { console.log("down", e.status); process.exit(1); }
