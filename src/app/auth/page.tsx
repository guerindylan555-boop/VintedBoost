"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function AuthPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [loading, setLoading] = useState(false);
  const next = useMemo(() => sp.get("next") || "/", [sp]);

  const continueAnonymously = useCallback(async () => {
    setLoading(true);
    try {
      await authClient.signInAnonymous();
      router.replace(next);
    } catch (e) {
      console.error(e);
      setLoading(false);
      alert("Impossible de créer la session. Réessayez.");
    }
  }, [next, router]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border border-gray-200 p-6 shadow-sm bg-white">
        <h1 className="text-xl font-semibold mb-2">Connexion requise</h1>
        <p className="text-sm text-gray-600 mb-6">
          Pour utiliser VintedBoost, commencez par créer une session.
        </p>

        <button
          onClick={continueAnonymously}
          disabled={loading}
          className="w-full bg-black text-white rounded-md py-2 text-sm disabled:opacity-60"
        >
          {loading ? "Ouverture…" : "Continuer (session anonyme)"}
        </button>

        <p className="text-xs text-gray-500 mt-4">
          Astuce: vous pourrez connecter d’autres méthodes plus tard (email, Google…).
        </p>
      </div>
    </div>
  );
}

