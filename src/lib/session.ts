import { cookies } from "next/headers";
import { randomUUID } from "crypto";

export async function getOrCreateSession(): Promise<string> {
  const jar = await cookies();
  let sid = jar.get("vb_session")?.value;
  if (!sid) {
    sid = randomUUID();
    jar.set("vb_session", sid, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 180, // ~6 months
    });
  }
  return sid;
}

