/**
 * Development sign-in: named test people without Google, so a GM and a player can be driven
 * from two browser tabs on one machine. The server mints tokens with a key made at startup
 * and accepts them beside Supabase's. It exists only when DEV_SIGNIN=1 outside production;
 * main.ts refuses to start with it in production.
 */
import { createHash } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { type Identity, type Verifier, jwtVerifier } from "./auth.ts";

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

export async function devSignIn(): Promise<DevSignIn> {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: "ES256" }] });
  return {
    verifier: jwtVerifier(keys, ISSUER),
    tokenFor: (name) =>
      new SignJWT({ email: `${name.toLowerCase().replace(/\W+/g, ".")}@dev.local`, user_metadata: { full_name: name } })
        .setProtectedHeader({ alg: "ES256" })
        .setSubject(idFor(name))
        .setIssuer(ISSUER)
        .setAudience("authenticated")
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(privateKey),
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
