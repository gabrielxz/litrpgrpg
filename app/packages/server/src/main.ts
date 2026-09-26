/**
 * Starts the server: migrate, store the current rules snapshot, serve the API and the live
 * channel.
 *
 *   DATABASE_URL  Postgres connection (required)
 *   SUPABASE_URL  the Supabase project whose sign-ins the server accepts (required)
 *   PORT          HTTP port (default 8787)
 *   RULES_DIR     the rules data (default: the repository's rules/)
 */
import { serve } from "@hono/node-server";
import { loadRules } from "@gradebreaker/engine/node";
import type { Server } from "node:http";
import { createApp } from "./app.ts";
import { supabaseVerifier } from "./auth.ts";
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

const db = postgresDb(required("DATABASE_URL"));
const verifier = supabaseVerifier(required("SUPABASE_URL"));
const port = Number(process.env.PORT ?? 8787);

for (const name of await migrate(db)) log(`migrated ${name}`);
const service = await Service.open(db, loadRules(process.env.RULES_DIR), verifier, log);
const hub = new LiveHub(service, log);
const app = createApp(service, { connected: () => hub.connected });
const server = serve({ fetch: app.fetch, port }, (info) => log(`rules ${service.rulesVersion}, listening on :${info.port}`));
hub.attach(server as Server);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    hub.close();
    server.close();
    void db.close().then(() => process.exit(0));
  });
}
