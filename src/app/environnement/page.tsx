"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type EnvItem = {
  id: string;
  createdAt: number | string;
  prompt: string;
  kind: "chambre" | "salon";
  image: string; // data URL or http URL
  meta?: Record<string, unknown> | null;
  isDefault?: boolean;
};

function cx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function EnvironmentPage() {
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"chambre" | "salon" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [items, setItems] = useState<EnvItem[]>([]);
  const canGenerate = useMemo(() => Boolean(prompt.trim()) && !generating && Boolean(kind), [prompt, generating, kind]);

  useEffect(() => {
    // hydrate from local cache first
    try {
      const raw = localStorage.getItem("vintedboost_envs");
      if (raw) {
        const local = JSON.parse(raw) as EnvItem[];
        if (Array.isArray(local)) setItems(local);
      }
    } catch {}
    // then fetch from server best-effort
    (async () => {
      try {
        const res = await fetch(`/api/environments`, { cache: "no-store" });
        if (!res.ok) return; // silently ignore if unauthorized
        const data = (await res.json()) as { items?: EnvItem[] };
        if (Array.isArray(data?.items)) {
          setItems(data.items);
          try { localStorage.setItem("vintedboost_envs", JSON.stringify(data.items)); } catch {}
          // If user has no items yet, show onboarding (kind null)
          if ((data.items || []).length === 0) setKind(null);
          else {
            // default active tab based on existing kinds
            const haveChambre = data.items.some((x) => x.kind === "chambre");
            const haveSalon = data.items.some((x) => x.kind === "salon");
            setKind(haveChambre ? "chambre" : haveSalon ? "salon" : null);
          }
        }
      } catch {}
    })();
  }, []);

  async function generate() {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/generate-environment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), kind: kind || "chambre" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String((data as any)?.error || "Échec de la génération"));
      const url = (Array.isArray((data as any)?.images) ? (data as any).images[0] : null) || null;
      if (!url) throw new Error("Pas d'image reçue");
      setPreview(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function savePreview() {
    if (!preview) return;
    try {
      const res = await fetch("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), kind: kind || "chambre", image: preview }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String((data as any)?.error || "Échec de l'enregistrement"));
      const newItem: EnvItem = (data as any).item as EnvItem;
      setItems((prev) => {
        const next = [newItem, ...prev];
        try { localStorage.setItem("vintedboost_envs", JSON.stringify(next)); } catch {}
        return next;
      });
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteItem(id: string) {
    try {
      const res = await fetch(`/api/environments/${encodeURIComponent(String(id))}`, { method: "DELETE" });
      if (!res.ok) {
        try {
          const data = await res.json();
          throw new Error(String((data as any)?.error || "Suppression impossible"));
        } catch {
          throw new Error("Suppression impossible");
        }
      }
      setItems((prev) => {
        const next = prev.filter((x) => String(x.id) !== String(id));
        try { localStorage.setItem("vintedboost_envs", JSON.stringify(next)); } catch {}
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const filtered = useMemo(() => items.filter((x) => (kind ? x.kind === kind : true)), [items, kind]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-50 to-white text-gray-900 dark:from-gray-950 dark:to-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-screen-md px-4 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold uppercase tracking-widest">ENVIRONNEMENT</h1>
            <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">Chambre / Salon</span>
          </div>
          <div className="flex items-center gap-3" />
        </div>
      </header>

      <main className="mx-auto max-w-screen-md p-4">
        {/* Onboarding: choose kind when none exists */}
        {items.length === 0 && kind === null ? (
          <div className="mx-auto max-w-sm text-center">
            <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">Choisissez un type d’environnement pour commencer</div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setKind("chambre")} className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-6 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">Chambre</button>
              <button onClick={() => setKind("salon")} className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-6 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">Salon</button>
            </div>
          </div>
        ) : null}

        {/* Tabs for kind selection when there are items */}
        {items.length > 0 ? (
          <div className="mb-4 inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-gray-900">
            {(["chambre", "salon"] as const).map((k) => (
              <button key={k}
                onClick={() => setKind(k)}
                className={cx("px-3 py-1.5 text-sm rounded-md", kind === k ? "bg-brand-600 text-white" : "text-gray-700 dark:text-gray-200")}
              >
                {k.charAt(0).toUpperCase() + k.slice(1)}
                <span className="ml-1 text-xs opacity-70">{items.filter((x) => x.kind === k).length}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm md:col-start-1 md:row-start-1">
            <div className="mb-2">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={kind === 'salon' ? "Ex: salon moderne, canapé gris, table basse en bois, plante, lumière naturelle" : "Ex: chambre scandinave, lit en bois clair, draps blancs, mur beige, plantes"}
                className="w-full min-h-28 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={generate}
                disabled={!canGenerate}
                className={cx(
                  "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition",
                  canGenerate ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                )}
              >
                {generating ? "Génération…" : "Générer l’image d’environnement"}
              </button>
            </div>
            {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}

            {preview ? (
              <div className="mt-4">
                <div className="relative w-full aspect-[4/3] rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900">
                  <Image src={preview} alt="aperçu" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain" unoptimized />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={savePreview}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
                  >
                    Enregistrer comme environnement
                  </button>
                  <button
                    onClick={() => setPreview(null)}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Réinitialiser
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold uppercase tracking-wide">Mes environnements</h2>
            </div>
            {filtered.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Aucun environnement sauvegardé.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filtered.map((it) => (
                  <div key={it.id} className={cx("group overflow-hidden rounded-xl border bg-white/60 dark:bg-gray-900/60", it.isDefault ? "border-brand-600 dark:border-brand-600" : "border-gray-200 dark:border-gray-700") }>
                    <div className="relative h-40 bg-gray-50 dark:bg-gray-900">
                      <Image src={it.image} alt={it.prompt} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" unoptimized />
                      <div className="absolute left-2 top-2 rounded-md bg-white/85 dark:bg-gray-900/80 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:text-gray-300">{new Date(it.createdAt).toLocaleString()}</div>
                      {it.isDefault ? (
                        <div className="absolute right-2 top-2 rounded-md bg-brand-600 px-2 py-0.5 text-[10px] font-medium text-white">Défaut</div>
                      ) : null}
                    </div>
                    <div className="p-3">
                      <div className="truncate text-sm" title={it.prompt}>{it.prompt}</div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/environments/${encodeURIComponent(String(it.id))}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: it.isDefault ? "unset-default" : "set-default" }) });
                              if (!res.ok) throw new Error("Action impossible");
                              // refresh list
                              const r = await fetch(`/api/environments?kind=${encodeURIComponent(String(kind || 'chambre'))}`, { cache: "no-store" });
                              if (r.ok) {
                                const data = await r.json();
                                if (Array.isArray(data?.items)) {
                                  setItems(data.items as EnvItem[]);
                                  try { localStorage.setItem("vintedboost_envs", JSON.stringify(data.items)); } catch {}
                                }
                              }
                            } catch (e) {
                              setError(e instanceof Error ? e.message : String(e));
                            }
                          }}
                          className={cx("inline-flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs", it.isDefault ? "border-brand-600 text-brand-700 dark:text-brand-400" : "border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200")}
                        >
                          {it.isDefault ? "Retirer défaut" : "Définir par défaut"}
                        </button>
                        <button
                          onClick={() => deleteItem(it.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
