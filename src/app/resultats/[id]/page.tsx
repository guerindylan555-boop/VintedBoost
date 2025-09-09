"use client";

import { useEffect, useState } from "react";
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
      const imgRes = await fetch("/api/generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        const withDesc: Item = { ...withImages, description: data };
        setItem(withDesc);
        upsertLocalHistory(withDesc);
        try {
          const patchRes = await fetchWithTimeout(
            `/api/history/${encodeURIComponent(String(item.id))}`,
            { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description: data }) },
            2000
          );
          if (!patchRes.ok) {
            await fetchWithTimeout(
              "/api/history",
              { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, source: item.source, results: images, createdAt: item.createdAt, description: data }) },
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
    const updated: Item = { ...item, status: "draft", updatedAt: Date.now() };
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
    const updated: Item = { ...item, status: "final", updatedAt: Date.now() };
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
        <h1 className="mb-3 text-base font-semibold uppercase tracking-wide">Résultat</h1>
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
            {item.description ? (
              <div className="mt-3">
                <DescriptionPanel data={item.description} />
              </div>
            ) : null}
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
