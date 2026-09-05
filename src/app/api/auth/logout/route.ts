import { NextResponse } from "next/server";
import { destroySession } from "@/infrastructure/auth/session";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
