/**
 * Password reset rules.
 *
 * Pure, like the rest of the domain: no clock, no database, no crypto. `now` is passed in,
 * which is what makes "expired by one second" a test rather than a hope.
 */

/** How long a reset grant stays valid. Short, because the whole point is a narrow window. */
export const RESET_TOKEN_TTL_MINUTES = 30;

/** Minimum length for a new password. */
export const PASSWORD_MIN_LENGTH = 8;

export type TokenVerdict =
  | { usable: true }
  | { usable: false; reason: string };

export interface TokenState {
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Is this grant still spendable?
 *
 * The reasons are deliberately identical in wording for "expired" and "already used". A
 * caller who can tell those apart learns whether a token ever existed and whether someone
 * else has already spent it, which is information an attacker holding a guessed token
 * should not get.
 */
export function checkToken(state: TokenState | null, now: Date): TokenVerdict {
  const REFUSAL = "This reset link is no longer valid. Request a new one.";
  if (state === null) return { usable: false, reason: REFUSAL };
  if (state.usedAt !== null) return { usable: false, reason: REFUSAL };
  if (state.expiresAt.getTime() <= now.getTime()) return { usable: false, reason: REFUSAL };
  return { usable: true };
}

/** When a token issued at `now` should stop working. */
export function expiryFor(now: Date, ttlMinutes: number = RESET_TOKEN_TTL_MINUTES): Date {
  return new Date(now.getTime() + ttlMinutes * 60 * 1000);
}

export type PasswordVerdict =
  | { acceptable: true }
  | { acceptable: false; reason: string };

/**
 * Is this an acceptable new password?
 *
 * Length is the only hard rule. Composition rules ("one capital, one symbol") measurably
 * push people towards `Password1!` and are not worth the friction; length is what actually
 * costs an attacker. The confirmation check lives here too so the API and any future UI
 * cannot disagree about what "matching" means.
 */
export function checkNewPassword(password: string, confirmation: string): PasswordVerdict {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      acceptable: false,
      reason: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password !== confirmation) {
    return { acceptable: false, reason: "The two passwords do not match." };
  }
  return { acceptable: true };
}
