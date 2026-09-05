import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/infrastructure/db";
import { createSession, verifyPassword } from "@/infrastructure/auth/session";
import { apiError } from "@/app/api/_lib/respond";
import { landingPathFor } from "@/infrastructure/auth/landing";

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function POST(request: NextRequest) {
  try {
    const { email, password } = LoginSchema.parse(await request.json());

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // One message for "no such user", "wrong password" and "account disabled". Telling an
    // attacker which of the three it was turns the login form into a user-enumeration
    // oracle. The password is still compared on the miss path so the response time does
    // not leak whether the address exists.
    const stored = user?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidix";
    const passwordOk = await verifyPassword(password, stored);

    if (!user || !user.isActive || !passwordOk) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      customerId: user.customerId,
    });

    return NextResponse.json({
      user: { name: user.name, role: user.role },
      redirectTo: landingPathFor(user.role),
    });
  } catch (error) {
    return apiError(error);
  }
}
