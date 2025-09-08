import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins/anonymous";
import { Pool } from "pg";

// Prefer Vercel Postgres connection if provided
const connectionString =
  process.env.POSTGRES_URL || process.env.DATABASE_URL || undefined;

// Pool is safe to create at module scope in Next.js (reused across invocations)
const pool = connectionString
  ? new Pool({ connectionString })
  : undefined;

export const auth = betterAuth({
  // Automatically infers baseURL from request in Next.js.
  // Default basePath is "/api/auth"; no need to override unless customizing.
  basePath: "/api/auth",

  // Wire Postgres via node-postgres Pool if configured; falls back to memory adapter if not.
  // In production you should provide POSTGRES_URL / DATABASE_URL.
  ...(pool ? { database: pool } : {}),

  // Enable Next.js cookies and keep anonymous plugin (can be removed if not needed)
  plugins: [nextCookies(), anonymous()],

  // Email + password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    // You can wire forgot-password emails later via sendResetPassword
  },

  // Sensible defaults; you can further tune cookies, session TTL, etc.
  // secret read from BETTER_AUTH_SECRET / AUTH_SECRET or uses a dev default.
});

// Attempt to run migrations on cold start when a database is configured.
if (pool) {
  // Fire and forget; errors will be logged server-side
  // Tables are created if missing (users, sessions, accounts, verification)
  auth.runMigrations?.().catch(() => {});
}
