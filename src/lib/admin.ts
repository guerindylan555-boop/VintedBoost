export function getAdminEmails(): string[] {
  // Server: ADMIN_EMAILS preferred; Client: NEXT_PUBLIC_ADMIN_EMAILS only
  const raw = (typeof window === "undefined")
    ? (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    : (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "");
  return String(raw)
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = getAdminEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(String(email).toLowerCase());
}
