/**
 * Development sign-in: named test people without Google, so a GM and a player can be driven
 * from two browser tabs on one machine. The server mints tokens with a fixed local secret, so
 * a dev server restarting on every edit keeps everyone signed in, and accepts them beside
 * Supabase's. It exists only when DEV_SIGNIN=1 outside production; main.ts refuses to start
 * with it in production, which is why a fixed secret is safe here.
 */
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { type Identity, type Verifier, identityOf } from "./auth.ts";

const ISSUER = "gradebreaker-dev-signin";

export interface DevSignIn {
  verifier: Verifier;
  /** A token for the test person with this name; the same name is always the same person. */
  tokenFor(name: string): Promise<string>;
}

/** A UUID-shaped id derived from the name, so a dev person keeps their campaigns across restarts. */
function idFor(name: string): string {
  const h = createHash("sha256").update(`dev:${name.toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function devSignIn(secretText = process.env.DEV_SIGNIN_SECRET ?? "gradebreaker-local-development"): Promise<DevSignIn> {
  const secret = new TextEncoder().encode(secretText);
  return {
    verifier: {
      async verify(token) {
        try {
          const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: "authenticated" });
          return identityOf(payload);
        } catch {
          return null;
        }
      },
    },
    tokenFor: (name) =>
      new SignJWT({ email: `${name.toLowerCase().replace(/\W+/g, ".")}@dev.local`, user_metadata: { full_name: name } })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(idFor(name))
        .setIssuer(ISSUER)
        .setAudience("authenticated")
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(secret),
  };
}

/** Accepts a token any of the verifiers accepts. */
export function eitherVerifier(...verifiers: Verifier[]): Verifier {
  return {
    async verify(token): Promise<Identity | null> {
      for (const v of verifiers) {
        const id = await v.verify(token);
        if (id) return id;
      }
      return null;
    },
  };
}
