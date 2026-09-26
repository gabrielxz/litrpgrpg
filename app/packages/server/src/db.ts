/**
 * The database seam. The server speaks SQL through this interface to either a Postgres pool
 * (development and production) or PGlite, Postgres compiled to WebAssembly, which the tests
 * run in-process. Both take `$1` parameters and return plain rows. Every connection's search
 * path is the private schema, so queries name tables without it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export interface Queryable {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  /** Runs `fn` in one transaction: committed if it returns, rolled back if it throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Runs a script of several statements with no parameters (migrations). */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** The schema that holds every table. Supabase's Data API does not expose it. */
export const SCHEMA = "gradebreaker";

export function postgresDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString });
  const ready = new WeakSet<pg.PoolClient>();
  /** A pooled connection, its search path set before its first use. */
  async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      if (!ready.has(client)) {
        await client.query(`set search_path to ${SCHEMA}`);
        ready.add(client);
      }
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return {
    query: (sql, params) => withClient(async (c) => (await c.query(sql, params as unknown[])).rows),
    tx: (fn) =>
      withClient(async (client) => {
        await client.query("begin");
        try {
          const out = await fn({ query: async (sql, params) => (await client.query(sql, params as unknown[])).rows });
          await client.query("commit");
          return out;
        } catch (e) {
          await client.query("rollback");
          throw e;
        }
      }),
    exec: (sql) => withClient(async (c) => void (await c.query(sql))),
    close: () => pool.end(),
  };
}

export async function pgliteDb(db: PGlite): Promise<Db> {
  await db.exec(`set search_path to ${SCHEMA}`);
  return {
    async query(sql, params) {
      return (await db.query<any>(sql, params as unknown[])).rows;
    },
    tx: (fn) => db.transaction((t) => fn({ query: async (sql, params) => (await t.query<any>(sql, params as unknown[])).rows })),
    async exec(sql) {
      await db.exec(sql);
    },
    close: () => db.close(),
  };
}

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), "../migrations");

/** Applies every `migrations/*.sql` not yet recorded, in name order, each in its own transaction. */
export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`create schema if not exists ${SCHEMA}`);
  await db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());" +
      "alter table schema_migrations enable row level security;",
  );
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const applied: string[] = [];
  for (const name of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    const sql = readFileSync(join(MIGRATIONS, name), "utf8");
    await db.exec(`begin;\n${sql}\ninsert into schema_migrations (name) values ('${name}');\ncommit;`);
    applied.push(name);
  }
  return applied;
}
