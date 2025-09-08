import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Mount Better Auth under /api/auth/*
export const { GET, POST } = toNextJsHandler(auth);

