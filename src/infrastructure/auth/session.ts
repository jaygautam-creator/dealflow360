import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma";

/**
 * Session handling.
 *
 * Sessions are stateless signed JWTs held in an httpOnly cookie. httpOnly means client
 * JavaScript cannot read the token, which removes the most common XSS token-theft path;
 * sameSite=lax blocks the cross-site form-post CSRF case while still allowing normal
 * top-level navigation into the app from an emailed quotation link.
 *
 * The payload carries only identity and role — never anything a client could act on. Every
 * authorisation decision is re-derived server-side from that role on each request, so a
 * tampered or stale token cannot grant capability it did not have.
 */

const COOKIE_NAME = "dealflow_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // one working day

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Set only for PORTAL users. This is the tenancy boundary for every portal query. */
  customerId: string | null;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set. Generate one with: openssl rand -base64 32");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  // Cost 10 — deliberate work factor, so a leaked hash table is expensive to attack.
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    customerId: user.customerId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Returns the current principal, or null. Never throws on a bad or expired token. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
      customerId: (payload.customerId as string | null) ?? null,
    };
  } catch {
    // Expired, tampered with, or signed by a rotated secret — all mean "not logged in".
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Thrown by the guards below. Route handlers map it to 401/403. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
