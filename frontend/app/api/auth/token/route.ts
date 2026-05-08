import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { SignJWT } from "jose";
import { authOptions } from "@/lib/authOptions";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const key = new TextEncoder().encode(secret);
  const token = await new SignJWT({ sub: session.user.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  return NextResponse.json({ token });
}
