"use client";

import { useEffect, useState } from "react";
import type React from "react";
import { useParams, useRouter } from "next/navigation";
import LoadingScreen from "@/components/LoadingScreen";
import ResultsGallery from "@/components/ResultsGallery";
import DescriptionPanel from "@/components/DescriptionPanel";
import type { MannequinOptions } from "@/lib/prompt";

type Item = {
  id: string;
  createdAt: number | string;
  updatedAt?: number | string;
  source: string;
  results: string[];
  description?: Record<string, unknown> | null;
  status?: "draft" | "final";
  meta?: {
    options: MannequinOptions;
    product: { brand: string; model: string; condition?: string };
    descEnabled: boolean;
    env?: { useDefault: boolean; kind: "chambre" | "salon"; image?: string };
  };
  title?: string;
};

function upsertLocalHistory(item: Item) {
  try {
    const raw = localStorage.getItem("vintedboost_history");
    const prev = raw ? (JSON.parse(raw) as Item[]) : [];
    const idx = prev.findIndex((x) => String(x.id) === String(item.id));
    const next = [...prev];
    if (idx >= 0) next[idx] = { ...next[idx], ...item, updatedAt: Date.now() };
    else next.unshift({ ...item, updatedAt: Date.now() });
    localStorage.setItem("vintedboost_history", JSON.stringify(next));
    localStorage.setItem("vintedboost_last", JSON.stringify(next[0]));
  } catch {}
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...(init || {}), signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export default function ResultatsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loadingItem, setLoadingItem] = useState(true);
  const [step, setStep] = useState<"idle" | "prepare" | "generating" | "saving" | "done" | "error">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [title, setTitle] = useState("");
  const [savingEdits, setSavingEdits] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editDescMode, setEditDescMode] = useState(false);
  const [descText, setDescText] = useState("");
  const [genPoses, setGenPoses] = useState<string[] | null>(null);
  const [genErrors, setGenErrors] = useState<Record<string, string> | null>(null);

  // Load item
  useEffect(() => {
    const theId = decodeURIComponent(String(id || ""));
    if (!theId) { setLoadingItem(false); return; }
    let found: Item | null = null;
    try {
      const rawHist = localStorage.getItem("vintedboost_history");
      if (rawHist) {
        const list = JSON.parse(rawHist) as Item[];
        found = Array.isArray(list) ? list.find((x) => String(x.id) === theId) || null : null;
      }
    } catch {}
    if (!found) {
      try {
        const rawLast = localStorage.getItem("vintedboost_last");
        if (rawLast) {
          const last = JSON.parse(rawLast) as Item;
          if (last && String(last.id) === theId) found = last;
        }
      } catch {}
    }
    // Fallback: sessionStorage temporary payload
    if (!found) {
      try {
        const tmp = sessionStorage.getItem(`vintedboost_tmp_${theId}`);
        if (tmp) {
          const obj = JSON.parse(tmp) as Item;
          if (obj && obj.source) found = obj;
        }
      } catch {}
    }
    setItem(found);
    setLoadingItem(false);
    try {
      const desc = (found?.description || null) as (null | { title?: string; descriptionText?: string });
      const t = (found?.title || desc?.title || "").toString();
      if (t) setTitle(String(t));
      const d = (desc?.descriptionText || "").toString();
      if (d) setDescText(String(d));
    } catch {}
  }, [id]);

  const descEnabled = Boolean(item?.meta?.descEnabled);

  // Start generation automatically once when page loads and item is valid and not already with results
  useEffect(() => {
    if (loadingItem) return;
    if (!item || !item.source) return;
    if (started || step !== "idle") return;
    // Even if images already exist, we could still generate description separately later.
    setStarted(true);
    runGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingItem, item]);

  async function runGeneration() {
    if (!item) return;
    let context = "Initialisation";
    try {
      setError(null);
      setStep("prepare");
      setProgress(8);
      context = "Préparation";

      // Parallel generation: images and (optional) description
      setStep("generating");
      setProgress(20);
      context = "Génération (images + description)";
      const provider = (() => {
        try {
          return localStorage.getItem("imageProvider");
        } catch {
          return null;
        }
      })();
      const sharedHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (provider) sharedHeaders["X-Image-Provider"] = provider;

      const imagesReq = fetch("/api/generate-images", {
        method: "POST",
        headers: sharedHeaders,
        body: JSON.stringify({
          imageDataUrl: item.source,
          environmentImageDataUrl: item.meta?.env?.useDefault ? (item.meta?.env?.image || null) : null,
          options: item.meta?.options,
          poses: item.meta?.options?.poses,
        }),
      })
        .then(async (res) => {
          const json = await res.json();
          if (!res.ok) {
            const envMode = Boolean(item.meta?.env?.useDefault && item.meta?.env?.image);
            const baseMsg = (json?.error as string) || "Échec de la génération des images";
            const suggestions = envMode
              ? "\n\nAstuce: Google peut refuser le mode 2‑images. Vous pouvez: essayer sans environnement, modifier le prompt/style/poses, changer d’environnement, ou sélectionner manuellement OpenRouter dans Paramètres."
              : "";
            throw new Error(baseMsg + suggestions);
          }
          const imagesAll = (json.images || []) as Array<string | null | undefined>;
          const posesOrdered = Array.isArray(json?.poses) ? (json.poses as string[]) : null;
          const errorsByPose = (json?.errors as Record<string, string> | undefined) || null;
          const posesForSuccess = posesOrdered ? imagesAll.map((img, i) => (img ? posesOrdered[i] : null)).filter(Boolean) as string[] : null;
          setGenPoses(posesForSuccess);
          setGenErrors(errorsByPose);
          const images = imagesAll.filter((u): u is string => typeof u === 'string' && !!u);
          // Dev: echo instructions to console to help debug prompts
          try {
            if (process.env.NODE_ENV !== 'production') {
              if (Array.isArray(json?.instructions)) console.debug('[generate-images] instructions', json.instructions);
              if (json?.debug) console.debug('[generate-images] debug', json.debug, { options: item.meta?.options, env: item.meta?.env });
            }
          } catch {}
          const next: Item = { ...item, results: images };
          setItem(next);
          upsertLocalHistory(next);
          return images;
        });

      const descReq = descEnabled
        ? fetch("/api/describe-photo", {
            method: "POST",
            headers: sharedHeaders,
            body: JSON.stringify({
              imageDataUrl: item.source,
              product: {
                brand: item.meta?.product.brand || null,
                model: item.meta?.product.model || null,
                gender: item.meta?.options.gender || null,
                size: item.meta?.options.size || null,
                condition: (item.meta?.product.condition as string | null) || null,
              },
            }),
          })
            .then(async (res) => {
              const data = await res.json();
              if (!res.ok) throw new Error(data?.error || "Échec de la génération de la description");
              return data as Record<string, unknown>;
            })
        : Promise.resolve(null as Record<string, unknown> | null);

      const [imgSettled, descSettled] = await Promise.allSettled([imagesReq, descReq]);

      if (imgSettled.status !== "fulfilled") {
        throw new Error(imgSettled.reason instanceof Error ? imgSettled.reason.message : String(imgSettled.reason));
      }

      let finalWithImages: Item = { ...item, results: imgSettled.value };
      setItem(finalWithImages);
      upsertLocalHistory(finalWithImages);
      setProgress(descEnabled ? 70 : 90);

      if (descEnabled) {
        let descError: string | null = null;
        let data: Record<string, unknown> = {};
        if (descSettled.status !== "fulfilled") {
          descError = descSettled.reason instanceof Error ? descSettled.reason.message : String(descSettled.reason);
        } else {
          data = descSettled.value || {} as Record<string, unknown>;
        }
        // Auto-title if missing
        let nextTitle = (title || "").trim();
        if (!nextTitle) {
          const dTitle = typeof (data as any)?.title === "string" ? ((data as any).title as string) : "";
          if (dTitle) nextTitle = dTitle;
          else {
            const brand = (finalWithImages.meta?.product.brand || "").trim();
            const model = (finalWithImages.meta?.product.model || "").trim();
            const size = (finalWithImages.meta?.options.size || "").toString().toUpperCase();
            const base = [brand, model].filter(Boolean).join(" ");
            if (base) nextTitle = size ? `${base} (${size})` : base;
            if (!nextTitle) {
              const text = typeof (data as any)?.descriptionText === "string" ? ((data as any).descriptionText as string) : "";
              if (text) nextTitle = text.slice(0, 60).replace(/\s+\S*$/, "").trim();
            }
            if (!nextTitle) nextTitle = `Annonce du ${new Date(finalWithImages.createdAt).toLocaleDateString()}`;
          }
        }
        const withDesc: Item = { ...finalWithImages, description: data, title: nextTitle };
        setItem(withDesc);
        setTitle(withDesc.title || "");
        setDescText(typeof (data as any)?.descriptionText === "string" ? ((data as any).descriptionText as string) : "");
        upsertLocalHistory(withDesc);
        finalWithImages = withDesc;
        // If description failed, show banner but do not block results
        if (descError) {
          setError(`Description non générée: ${descError}`);
        }
      }

      // Persist to /api/history once after generation
      try {
        const saveBody = {
          id: finalWithImages.id,
          source: finalWithImages.source,
          results: finalWithImages.results,
          createdAt: finalWithImages.createdAt,
          description: finalWithImages.description ?? null,
        };
        await fetchWithTimeout("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saveBody) }, 2000);
      } catch {}

      // Saving/done
      setStep("saving");
      setProgress(96);
      setTimeout(() => { setStep("done"); setProgress(100); }, 200);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Étape: ${step === "generating" ? "Génération" : step === "prepare" ? "Préparation" : step === "saving" ? "Finalisation" : context} - ${msg || "Erreur inconnue"}`);
      setStep("error");
      setProgress(null);
    }
  }

  function retry() {
    setStarted(false);
    setError(null);
    setStep("idle");
    setProgress(null);
    runGeneration();
  }

  function saveDraft() {
    if (!item) return;
    const prevDesc = (item.description || null) as (null | { title?: string; [k: string]: unknown });
    const nextDesc: Record<string, unknown> | null = prevDesc ? { ...prevDesc, title: (title || "").trim() || prevDesc.title } : item.description ?? null;
    const updated: Item = { ...item, title: (title || "").trim() || item.title, description: nextDesc, status: "draft", updatedAt: Date.now() };
    setItem(updated);
    upsertLocalHistory(updated);
    try {
      fetchWithTimeout(
        "/api/history",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: updated.id, source: updated.source, results: updated.results, createdAt: updated.createdAt, description: updated.description ?? null }) },
        2000
      );
    } catch {}
    // Redirect to Mes annonces
    try { router.push("/annonces"); } catch {}
  }
  function saveFinal() {
    if (!item) return;
    const prevDesc = (item.description || null) as (null | { title?: string; [k: string]: unknown });
    const nextDesc: Record<string, unknown> | null = prevDesc ? { ...prevDesc, title: (title || "").trim() || prevDesc.title } : item.description ?? null;
    const updated: Item = { ...item, title: (title || "").trim() || item.title, description: nextDesc, status: "final", updatedAt: Date.now() };
    setItem(updated);
    upsertLocalHistory(updated);
    try {
      fetchWithTimeout(
        "/api/history",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: updated.id, source: updated.source, results: updated.results, createdAt: updated.createdAt, description: updated.description ?? null }) },
        2000
      );
    } catch {}
    // Redirect to Mes annonces
    try { router.push("/annonces"); } catch {}
  }

  async function saveTitleAndDescription() {
    if (!item) return;
    setSavingEdits(true);
    try {
      const prevDesc = (item.description || null) as (null | { title?: string; descriptionText?: string; [k: string]: unknown });
      const nextDesc: Record<string, unknown> = prevDesc ? { ...prevDesc, title: (title || "").trim() || prevDesc.title, descriptionText: descText } : { title: (title || "").trim() || undefined, descriptionText: descText };
      const updated: Item = { ...item, title: title?.trim() || item.title, description: nextDesc, updatedAt: Date.now() };
      setItem(updated);
      upsertLocalHistory(updated);
      // PATCH server
      try {
        const resp = await fetchWithTimeout(
          `/api/history/${encodeURIComponent(String(item.id))}`,
          { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: nextDesc }) },
          2000
        );
        if (!resp.ok) {
          await fetchWithTimeout(
            "/api/history",
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, source: item.source, results: item.results, createdAt: item.createdAt, description: nextDesc }) },
            2000
          );
        }
      } catch {}
      setEditDescMode(false);
    } finally {
      setSavingEdits(false);
    }
  }

  if (loadingItem) {
    return (
      <div className="mx-auto max-w-screen-md p-4">
        <LoadingScreen title="Chargement…" subtitle="Récupération de l’annonce" progress={null} />
      </div>
    );
  }

  if (!item || !item.source) {
    return (
      <div className="mx-auto max-w-screen-md p-4">
        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-6 text-center">
          <div className="text-sm text-gray-600 dark:text-gray-300">Annonce introuvable ou incomplète.</div>
          <button onClick={() => router.push("/creer") } className="mt-3 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Revenir à la création</button>
        </div>
      </div>
    );
  }

  const showLoading = step !== "done" && step !== "error";

  return (
    <div className="mx-auto max-w-screen-md p-4">
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-base font-semibold uppercase tracking-wide">Résultat</h1>
        </div>
        {/* Titre: afficher uniquement hors chargement/erreur */}
        {!showLoading && step !== "error" ? (
          <div className="mb-3">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Titre de l’annonce</label>
            {!editingTitle ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-3 py-2">
                  <div className="truncate text-sm" title={title || "Ajouter un titre"}>{title || "Ajouter un titre"}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  aria-label="Modifier le titre"
                  title="Modifier le titre"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={title}
                  onChange={(e)=>setTitle(e.target.value)}
                  maxLength={100}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>)=>{ if (e.key === 'Enter') { saveTitleAndDescription(); setEditingTitle(false); } if (e.key === 'Escape') { try { const desc = (item?.description||null) as (null|{ title?: string }); const t = (item?.title || desc?.title || "").toString(); setTitle(t); } catch {}; setEditingTitle(false); } }}
                  className="min-w-0 grow rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  placeholder="Ex: Robe Zara noire taille S"
                  autoFocus
                />
                <button onClick={async()=>{ await saveTitleAndDescription(); setEditingTitle(false); }} disabled={savingEdits} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{savingEdits?"Enregistrement…":"Enregistrer"}</button>
                <button
                  type="button"
                  onClick={() => { try { const desc = (item?.description||null) as (null|{ title?: string }); const t = (item?.title || desc?.title || "").toString(); setTitle(t); } catch {}; setEditingTitle(false); }}
                  className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        ) : null}
        {showLoading ? (
          <LoadingScreen
            title="Génération en cours"
            subtitle={descEnabled ? "Images et description en parallèle" : "Génération des images"}
            progress={progress}
            stepLabel={
              step === "prepare" ? "Préparation"
              : step === "generating" ? (descEnabled ? "Images + description" : "Images")
              : step === "saving" ? "Finalisation"
              : "Initialisation"
            }
            onCancel={() => router.push("/creer")}
          />
        ) : step === "error" ? (
          <LoadingScreen
            title="Échec de la génération"
            subtitle="Vous pouvez réessayer ou revenir à la création"
            error={error || "Une erreur est survenue."}
            onRetry={retry}
            onCancel={() => router.push("/creer")}
          />
        ) : (
          <>
            {error && step === "done" ? (
              <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">{error}</div>
            ) : null}
            <ResultsGallery sourceUrl={item.source} results={item.results} poses={genPoses || undefined} errorsByPose={genErrors || undefined} />
            <div className="mt-3">
              {!editDescMode ? (
                <>
                  <DescriptionPanel data={item.description || null} />
                  <div className="mt-2 flex items-center justify-end">
                    <button onClick={()=>setEditDescMode(true)} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Modifier la description</button>
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 p-3">
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Description</label>
                  <textarea value={descText} onChange={(e)=>setDescText(e.target.value)} className="w-full min-h-40 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200" />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button onClick={()=>setEditDescMode(false)} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Annuler</button>
                    <button onClick={saveTitleAndDescription} disabled={savingEdits} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{savingEdits?"Enregistrement…":"Enregistrer"}</button>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => router.push("/creer")} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Créer une autre annonce</button>
              <button type="button" onClick={saveDraft} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">Enregistrer en brouillon</button>
              <button type="button" onClick={saveFinal} className="rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm transition bg-brand-600 text-white hover:bg-brand-700">Enregistrer en annonce définitive</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
