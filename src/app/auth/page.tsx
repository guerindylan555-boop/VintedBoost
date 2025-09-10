"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Spinner from "@/components/Spinner";

// Ensure this route is never statically prerendered
export const dynamic = "force-dynamic";

function AuthPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = useMemo(() => sp.get("next") || "/", [sp]);

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "signup") {
        if (!name.trim()) {
          setError("Nom requis");
          setLoading(false);
          return;
        }
        await authClient.signUp.email({ name, email, password });
      } else {
        await authClient.signIn.email({ email, password });
      }
      // Ensure session is hydrated before redirect
      try {
        await authClient.getSession();
      } catch {}
      router.replace(next);
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Echec, vérifiez vos identifiants.";
      setError(msg);
      setLoading(false);
    }
  }, [mode, name, email, password, next, router]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-800 p-6 shadow-sm bg-white dark:bg-gray-900">
        <h1 className="text-xl font-semibold mb-2">Connexion</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
          Identifiez-vous pour accéder à VintedBoost.
        </p>

        <div className="mb-4 grid gap-2">
          <button
            onClick={() => {
              void authClient.signIn.social({ provider: "google", callbackURL: next });
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="shrink-0">
              <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.7-2.6-5.7-5.8S8.9 5.8 12 5.8c1.8 0 3 .8 3.7 1.5l2.5-2.4C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12S6.8 21.5 12 21.5c7 0 9.7-4.9 9.7-7.4 0-.5 0-.9-.1-1.3H12z"/>
            </svg>
            Continuer avec Google
          </button>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
            <span>ou</span>
            <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode("signin")}
            className={`flex-1 border rounded-md py-2 text-sm ${
              mode === "signin" ? "bg-black text-white" : ""
            }`}
          >
            Se connecter
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 border rounded-md py-2 text-sm ${
              mode === "signup" ? "bg-black text-white" : ""
            }`}
          >
            Créer un compte
          </button>
        </div>

        {mode === "signup" && (
          <div className="mb-3">
            <label className="block text-xs mb-1">Nom</label>
            <input
              className="w-full border rounded-md p-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs mb-1">Email</label>
          <input
            className="w-full border rounded-md p-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs mb-1">Mot de passe</label>
          <input
            className="w-full border rounded-md p-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-100 border-gray-300 dark:border-gray-700"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400 mb-3" aria-live="polite">{error}</p>}

        <button
          onClick={submit}
          disabled={loading}
          className="w-full bg-black dark:bg-white dark:text-black text-white rounded-md py-2 text-sm disabled:opacity-60"
        >
          {loading ? "Veuillez patienter…" : mode === "signup" ? "Créer le compte" : "Se connecter"}
        </button>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="p-6 flex items-center justify-center"><Spinner label="Chargement…" /></div>}>
      <AuthPageInner />
    </Suspense>
  );
}
