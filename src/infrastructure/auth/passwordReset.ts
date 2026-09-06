import "server-only";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Token generation and delivery for password resets.
 *
 * WHAT IS REAL HERE, AND WHAT IS NOT:
 * The token lifecycle is real — 256 bits of CSPRNG output, stored only as a SHA-256
 * digest, single-use, expiring, and invalidating its predecessors. Those are the
 * properties that decide whether a reset flow is safe, and none of them are stubbed.
 *
 * Delivery is the one piece this system cannot do: there is no mail service, and inventing
 * one would be fake infrastructure. So the link is written to the server log, which in a
 * locally-run system is a channel that genuinely exists and that the operator genuinely
 * reads. Swapping it for SMTP is this one function — everything above it is unchanged.
 *
 * The link is deliberately NOT returned to the browser. Returning it would mean anyone
 * able to type an email address could reset that account, which is a considerably worse
 * hole than the one the feature closes.
 */

/** 32 bytes, url-safe. Long enough that guessing is not a strategy. */
export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256, hex.
 *
 * Not bcrypt: bcrypt's cost exists to slow dictionary attacks on human-chosen secrets.
 * This secret is random and 256 bits wide, so there is no dictionary, and a fast digest
 * lets the lookup be a unique-index hit rather than a scan-and-compare over every row.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison, for anywhere a digest is compared outside a database lookup. */
export function digestsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Hands the reset link to the person who asked for it.
 *
 * The single seam between this feature and a mail provider. It logs rather than sends,
 * loudly and in a shape an operator can copy, because this system runs locally and has no
 * mail transport to honestly claim.
 */
export function deliverPasswordReset(input: {
  email: string;
  name: string;
  url: string;
  expiresAt: Date;
}): void {
  const minutes = Math.round((input.expiresAt.getTime() - Date.now()) / 60000);
  console.log(
    [
      "",
      "──────────────────────────────────────────────────────────────────────",
      "  PASSWORD RESET REQUESTED",
      `  for   : ${input.name} <${input.email}>`,
      `  link  : ${input.url}`,
      `  valid : ${minutes} minutes, single use`,
      "",
      "  No mail service is configured, so the link is delivered here. In a",
      "  deployment this function is where an email would be sent instead.",
      "──────────────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}
