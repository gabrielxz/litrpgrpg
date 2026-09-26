/**
 * Who is calling. People sign in with Supabase Auth (Google); the browser sends the access
 * token Supabase issued, and the server checks its signature against the project's published
 * keys (ES256, `/auth/v1/.well-known/jwks.json`), so no Supabase secret lives on the server.
 */
import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from "jose";

/** What the server takes from a verified token. */
export interface Identity {
  /** The Supabase Auth user id. */
  id: string;
  email: string | null;
  /** From the Google profile when present; the person can change it. */
  name: string | null;
}

export interface Verifier {
  /** The identity in a valid token, or null for a missing, expired, or forged one. */
  verify(token: string): Promise<Identity | null>;
}

/** Verifies tokens against a key set for one issuer; `audience` is Supabase's signed-in role. */
export function jwtVerifier(keys: JWTVerifyGetKey, issuer: string): Verifier {
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, keys, { issuer, audience: "authenticated" });
        if (typeof payload.sub !== "string" || !payload.sub) return null;
        const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
        const name = [meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim() !== "");
        return {
          id: payload.sub,
          email: typeof payload.email === "string" ? payload.email : null,
          name: name?.trim() ?? null,
        };
      } catch {
        return null;
      }
    },
  };
}

/** The verifier for a Supabase project, from its URL (`https://<ref>.supabase.co`). */
export function supabaseVerifier(projectUrl: string): Verifier {
  const base = projectUrl.replace(/\/+$/, "");
  return jwtVerifier(createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`)), `${base}/auth/v1`);
}
