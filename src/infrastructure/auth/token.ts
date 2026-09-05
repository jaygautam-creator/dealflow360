import { jwtVerify } from "jose";
import type { Role } from "@/generated/prisma";

/**
 * Token verification, deliberately free of `server-only` and of `next/headers`.
 *
 * Both the request pipeline (proxy.ts) and Server Components need to read a session, but
 * they get the cookie from different places. Keeping the verification itself here means
 * there is exactly one implementation of "is this token valid and what does it say" —
 * two copies would eventually disagree, and a security check that disagrees with itself
 * is worse than no check.
 */

export interface SessionClaims {
  id: string;
  email: string;
  name: string;
  role: Role;
  customerId: string | null;
}

export const SESSION_COOKIE = "dealflow_session";

export async function verifySessionToken(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
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
