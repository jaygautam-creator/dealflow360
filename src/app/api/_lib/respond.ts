import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/infrastructure/auth/session";

/**
 * One error shape for every API route.
 *
 * Routes throw; this maps the throw to a status. Without a single funnel like this, error
 * handling drifts — one route returns 400 for a validation failure, another returns 500,
 * and the client cannot tell "you sent bad data" from "we broke".
 *
 * Unexpected errors are logged in full server-side but returned as a generic message.
 * Leaking a stack trace or a database error string to a client is an information
 * disclosure bug, not a debugging convenience.
 */
export function apiError(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "The request body is not valid.",
        // Field-level detail so a form can highlight the offending input.
        issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  if (error instanceof DomainError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }

  console.error("[api] unhandled error:", error);
  return NextResponse.json({ error: "Something went wrong on our side." }, { status: 500 });
}

/**
 * A business rule said no. Distinct from a validation error: the request was well-formed,
 * but the domain refuses it — approving your own quotation, confirming an unapproved one.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
