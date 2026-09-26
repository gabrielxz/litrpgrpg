/**
 * Starts the server: migrate, store the current rules snapshot, serve the API and the live
 * channel.
 *
 *   DATABASE_URL  Postgres connection (default: the compose.yaml database)
 *   PORT          HTTP port (default 8787)
 *   RULES_DIR     the rules data (default: the repository's rules/)
 */
import { serve } from "@hono/node-server";
import { loadRules } from "@gradebreaker/engine/node";
import type { Server } from "node:http";
import { createApp } from "./app.ts";
import { migrate, postgresDb } from "./db.ts";
import { LiveHub } from "./live.ts";
import { Service } from "./service.ts";

const url = process.env.DATABASE_URL ?? "postgres://gradebreaker:gradebreaker@localhost:54340/gradebreaker";
const port = Number(process.env.PORT ?? 8787);
const log = (msg: string) => console.log(`[gradebreaker] ${msg}`);

const db = postgresDb(url);
for (const name of await migrate(db)) log(`migrated ${name}`);
const service = await Service.open(db, loadRules(process.env.RULES_DIR), log);
const app = createApp(service);
const server = serve({ fetch: app.fetch, port }, (info) => log(`rules ${service.rulesVersion}, listening on :${info.port}`));
const hub = new LiveHub(service, log);
hub.attach(server as Server);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    hub.close();
    server.close();
    void db.close().then(() => process.exit(0));
  });
}
