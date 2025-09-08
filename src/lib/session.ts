import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function getSessionId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get("vb_session")?.value ?? null;
}

export function setSessionCookie(res: NextResponse, sid: string) {
  res.cookies.set("vb_session", sid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // ~6 months
  });
}
