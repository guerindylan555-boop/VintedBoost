import { createAuthClient } from "better-auth/react";

// Client for calling Better Auth endpoints from React
// Use basePath so SSR prerender doesn't require an absolute URL
export const authClient = createAuthClient({
  basePath: "/api/auth",
});
