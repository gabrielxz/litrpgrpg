/**
 * Starts the server: migrate, store the current rules snapshot, serve the API and the live
 * channel.
 *
 *   DATABASE_URL              Postgres connection (required)
 *   SUPABASE_URL              the Supabase project whose sign-ins the server accepts (required)
 *   SUPABASE_PUBLISHABLE_KEY  the project's public key, handed to the browser (Google sign-in is hidden without it)
 *   PORT                      HTTP port (default 8787)
 *   RULES_DIR                 the rules data (default: the repository's rules/)
 *   WEB_DIST                  the built web client (default: packages/web/dist, when it exists)
 *   DEV_SIGNIN                1 enables development sign-in; refused in production
 */
import { serve } from "@hono/node-server";
import { loadRules } from "@gradebreaker/engine/node";
import { existsSync } from "node:fs";
import type { Server } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { supabaseVerifier } from "./auth.ts";
import { devSignIn, eitherVerifier } from "./devauth.ts";
import { migrate, postgresDb } from "./db.ts";
import { LiveHub } from "./live.ts";
import { Service } from "./service.ts";

const log = (msg: string) => console.log(`[gradebreaker] ${msg}`);

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[gradebreaker] ${name} is not set`);
    process.exit(1);
  }
  return value;
}

if (process.env.DEV_SIGNIN === "1" && process.env.NODE_ENV === "production") {
  console.error("[gradebreaker] DEV_SIGNIN is refused in production");
  process.exit(1);
}

const db = postgresDb(required("DATABASE_URL"));
const supabaseUrl = required("SUPABASE_URL");
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!publishableKey) log("SUPABASE_PUBLISHABLE_KEY is not set: the web client cannot offer Google sign-in");
const dev = process.env.DEV_SIGNIN === "1" ? await devSignIn() : undefined;
const verifier = dev ? eitherVerifier(supabaseVerifier(supabaseUrl), dev.verifier) : supabaseVerifier(supabaseUrl);
const port = Number(process.env.PORT ?? 8787);
const webDist = process.env.WEB_DIST ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (dev) log("development sign-in is on");

for (const name of await migrate(db)) log(`migrated ${name}`);
const service = await Service.open(db, loadRules(process.env.RULES_DIR), verifier, log);
const hub = new LiveHub(service, log);
const app = createApp(service, {
  connected: () => hub.connected,
  ...(publishableKey ? { supabase: { url: supabaseUrl, publishableKey } } : {}),
  ...(dev ? { dev } : {}),
  ...(existsSync(resolve(webDist, "index.html")) ? { webDist } : {}),
});
const server = serve({ fetch: app.fetch, port }, (info) => log(`rules ${service.rulesVersion}, listening on :${info.port}`));
hub.attach(server as Server);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    hub.close();
    server.close();
    void db.close().then(() => process.exit(0));
  });
}
