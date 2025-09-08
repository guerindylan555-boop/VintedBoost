import { createAuthClient } from "better-auth/react";

// Client for calling Better Auth endpoints from React
export const authClient = createAuthClient({
  baseURL: "/api/auth",
});

