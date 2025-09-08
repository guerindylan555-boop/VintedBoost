"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function AuthPage() {
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
        await authClient.signUp.email({
          body: { name, email, password, rememberMe: true },
        });
      } else {
        await authClient.signIn.email({
          body: { email, password, rememberMe: true },
        });
      }
      router.replace(next);
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Echec, vérifiez vos identifiants.";
      setError(msg);
      setLoading(false);
    }
  }, [mode, name, email, password, next, router]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-gray-200 p-6 shadow-sm bg-white">
        <h1 className="text-xl font-semibold mb-2">Connexion</h1>
        <p className="text-sm text-gray-600 mb-6">
          Identifiez-vous pour accéder à VintedBoost.
        </p>

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
              className="w-full border rounded-md p-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs mb-1">Email</label>
          <input
            className="w-full border rounded-md p-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs mb-1">Mot de passe</label>
          <input
            className="w-full border rounded-md p-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <button
          onClick={submit}
          disabled={loading}
          className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-60"
        >
          {loading ? "Veuillez patienter…" : mode === "signup" ? "Créer le compte" : "Se connecter"}
        </button>
      </div>
    </div>
  );
}
