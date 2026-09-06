import { describe, expect, it } from "vitest";
import {
  PASSWORD_MIN_LENGTH,
  RESET_TOKEN_TTL_MINUTES,
  checkNewPassword,
  checkToken,
  expiryFor,
} from "./passwordReset";

const at = (iso: string) => new Date(iso);

describe("checkToken", () => {
  const now = at("2026-09-06T12:00:00Z");

  it("accepts a fresh unused token", () => {
    expect(checkToken({ expiresAt: at("2026-09-06T12:10:00Z"), usedAt: null }, now)).toEqual({
      usable: true,
    });
  });

  it("refuses a token that has expired", () => {
    expect(checkToken({ expiresAt: at("2026-09-06T11:59:59Z"), usedAt: null }, now).usable).toBe(false);
  });

  it("refuses a token expiring exactly now, rather than allowing the boundary", () => {
    expect(checkToken({ expiresAt: now, usedAt: null }, now).usable).toBe(false);
  });

  it("refuses a token that has already been spent", () => {
    expect(
      checkToken({ expiresAt: at("2026-09-06T12:10:00Z"), usedAt: at("2026-09-06T11:55:00Z") }, now)
        .usable,
    ).toBe(false);
  });

  it("refuses a token that does not exist", () => {
    expect(checkToken(null, now).usable).toBe(false);
  });

  // The security property: a caller must not be able to tell these cases apart.
  it("gives the same wording whether the token is unknown, spent or expired", () => {
    const unknown = checkToken(null, now);
    const spent = checkToken({ expiresAt: at("2026-09-06T12:10:00Z"), usedAt: now }, now);
    const expired = checkToken({ expiresAt: at("2026-09-06T11:00:00Z"), usedAt: null }, now);
    if (unknown.usable || spent.usable || expired.usable) throw new Error("expected refusals");
    expect(spent.reason).toBe(unknown.reason);
    expect(expired.reason).toBe(unknown.reason);
  });
});

describe("expiryFor", () => {
  it("expires the configured number of minutes after issue", () => {
    expect(expiryFor(at("2026-09-06T12:00:00Z")).toISOString()).toBe(
      new Date(at("2026-09-06T12:00:00Z").getTime() + RESET_TOKEN_TTL_MINUTES * 60000).toISOString(),
    );
  });

  it("accepts a caller-supplied ttl so the rule is testable without editing it", () => {
    expect(expiryFor(at("2026-09-06T12:00:00Z"), 5).toISOString()).toBe("2026-09-06T12:05:00.000Z");
  });
});

describe("checkNewPassword", () => {
  it("accepts a long enough matching pair", () => {
    expect(checkNewPassword("correct-horse", "correct-horse")).toEqual({ acceptable: true });
  });

  it("refuses anything shorter than the minimum", () => {
    expect(checkNewPassword("short", "short").acceptable).toBe(false);
    expect(checkNewPassword("a".repeat(PASSWORD_MIN_LENGTH - 1), "a".repeat(PASSWORD_MIN_LENGTH - 1)).acceptable).toBe(false);
  });

  it("accepts exactly the minimum length", () => {
    const pw = "a".repeat(PASSWORD_MIN_LENGTH);
    expect(checkNewPassword(pw, pw).acceptable).toBe(true);
  });

  it("refuses a mismatched confirmation", () => {
    expect(checkNewPassword("correct-horse", "correct-hors").acceptable).toBe(false);
  });

  it("checks length before matching, so a short pair says what is actually wrong", () => {
    const v = checkNewPassword("abc", "xyz");
    if (v.acceptable) throw new Error("expected refusal");
    expect(v.reason).toContain("characters");
  });
});
