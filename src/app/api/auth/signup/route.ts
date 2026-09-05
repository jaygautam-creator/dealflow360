import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { createSession, hashPassword } from "@/infrastructure/auth/session";
import { apiError } from "@/app/api/_lib/respond";
import { landingPathFor } from "@/infrastructure/auth/landing";

const SignupSchema = z
  .object({
    name: z.string().min(1, "Enter your name."),
    email: z.string().email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function POST(request: NextRequest) {
  try {
    const input = SignupSchema.parse(await request.json());
    const email = input.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Same generic shape as the login route's failure path — a distinct error message
      // here would let an attacker enumerate which emails are already registered.
      return NextResponse.json(
        { error: "an account with that email already exists" },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(input.password);

    // Role is hardcoded to SALES_REP and never read from the request body. A signup
    // endpoint that accepted a client-supplied role would let anyone POST
    // {"role":"ADMIN"} and grant themselves full access — this is not a field a public
    // endpoint may ever trust. Portal users are provisioned separately, against a
    // customer, never through open self-signup.
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email,
        passwordHash,
        role: "SALES_REP",
      },
    });

    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      customerId: user.customerId,
    });

    return NextResponse.json(
      {
        user: { name: user.name, role: user.role },
        redirectTo: landingPathFor(user.role),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
