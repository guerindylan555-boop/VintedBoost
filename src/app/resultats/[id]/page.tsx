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
  const [step, setStep] = useState<"idle" | "prepare" | "images" | "description" | "saving" | "done" | "error">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [title, setTitle] = useState("");
  const [savingEdits, setSavingEdits] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editDescMode, setEditDescMode] = useState(false);
  const [descText, setDescText] = useState("");

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
    if (Array.isArray(item.results) && item.results.length > 0) {
      setStep("done");
      setProgress(100);
      return;
    }
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

      // Step 1: images
      setStep("images");
      setProgress(20);
      context = "Génération des images";
      const provider = (() => {
        try {
          return localStorage.getItem("imageProvider");
        } catch {
          return null;
        }
      })();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (provider) headers["X-Image-Provider"] = provider;
      const imgRes = await fetch("/api/generate-images", {
        method: "POST",
        headers,
        body: JSON.stringify({ imageDataUrl: item.source, options: item.meta?.options, count: 1 }),
      });
      const imgJson = await imgRes.json();
      if (!imgRes.ok) throw new Error(imgJson?.error || "Échec de la génération des images");
      const images = (imgJson.images || []) as string[];
      const withImages: Item = { ...item, results: images };
      setItem(withImages);
      upsertLocalHistory(withImages);
      setProgress(60);
      try {
        await fetchWithTimeout(
          "/api/history",
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, source: item.source, results: images, createdAt: item.createdAt, description: item.description ?? null }) },
          2000
        );
      } catch {}

      // Step 2: description (optional)
      if (descEnabled) {
        setStep("description");
        setProgress(80);
        context = "Génération de la description";
        const res = await fetch("/api/describe-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Échec de la génération de la description");
        // Auto-title if missing
        let nextTitle = (title || "").trim();
        if (!nextTitle) {
          const dTitle = typeof data?.title === "string" ? (data.title as string) : "";
          if (dTitle) nextTitle = dTitle;
          else {
            const brand = (withImages.meta?.product.brand || "").trim();
            const model = (withImages.meta?.product.model || "").trim();
            const size = (withImages.meta?.options.size || "").toString().toUpperCase();
            const base = [brand, model].filter(Boolean).join(" ");
            if (base) nextTitle = size ? `${base} (${size})` : base;
            if (!nextTitle) {
              const text = typeof data?.descriptionText === "string" ? (data.descriptionText as string) : "";
              if (text) nextTitle = text.slice(0, 60).replace(/\s+\S*$/, "").trim();
            }
            if (!nextTitle) nextTitle = `Annonce du ${new Date(withImages.createdAt).toLocaleDateString()}`;
          }
        }
        const withDesc: Item = { ...withImages, description: data, title: nextTitle };
        setItem(withDesc);
        setTitle(withDesc.title || "");
        setDescText(typeof data?.descriptionText === "string" ? (data.descriptionText as string) : "");
        upsertLocalHistory(withDesc);
        try {
          const patchRes = await fetchWithTimeout(
            `/api/history/${encodeURIComponent(String(item.id))}`,
            { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: { ...data, title: withDesc.title || data?.title } }) },
            2000
          );
          if (!patchRes.ok) {
            await fetchWithTimeout(
              "/api/history",
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, source: item.source, results: images, createdAt: item.createdAt, description: { ...data, title: withDesc.title || data?.title } }) },
              2000
            );
          }
        } catch {}
      }

      // Step 3: saving/done
      setStep("saving");
      setProgress(96);
      setTimeout(() => { setStep("done"); setProgress(100); }, 200); // small delay for UX

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Étape: ${step === "images" ? "Génération des images" : step === "description" ? "Génération de la description" : step === "prepare" ? "Préparation" : step === "saving" ? "Finalisation" : context} - ${msg || "Erreur inconnue"}`);
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
              <div className="flex items-center gap-2">
                <input
                  value={title}
                  onChange={(e)=>setTitle(e.target.value)}
                  maxLength={100}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>)=>{ if (e.key === 'Enter') { saveTitleAndDescription(); setEditingTitle(false); } if (e.key === 'Escape') { try { const desc = (item?.description||null) as (null|{ title?: string }); const t = (item?.title || desc?.title || "").toString(); setTitle(t); } catch {}; setEditingTitle(false); } }}
                  className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
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
            subtitle="Veuillez patienter pendant la création du rendu"
            progress={progress}
            stepLabel={
              step === "prepare" ? "Préparation"
              : step === "images" ? "Génération des images"
              : step === "description" ? "Génération de la description"
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
            <ResultsGallery sourceUrl={item.source} results={item.results} />
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
