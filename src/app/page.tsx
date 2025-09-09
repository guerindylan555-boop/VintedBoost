"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildInstruction, type MannequinOptions } from "@/lib/prompt";
import Image from "next/image";
import Toggle from "@/components/Toggle";
import ThemeToggle from "@/components/ThemeToggle";
import ResultsGallery from "@/components/ResultsGallery";
import DescriptionPanel from "@/components/DescriptionPanel";

function cx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Small utility to avoid UI hanging on slow API routes
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

export default function Home() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outImages, setOutImages] = useState<string[]>([]);
  const fileInputGalleryRef = useRef<HTMLInputElement | null>(null);
  const fileInputCameraRef = useRef<HTMLInputElement | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const [history, setHistory] = useState<
    { id: string; createdAt: number | string; source: string; results: string[]; description?: Record<string, unknown> | null }[]
  >([]);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);

  // Informations sur le vêtement (marque, modèle, état) + toggle d'activation
  const [product, setProduct] = useState<{ brand: string; model: string; condition?: string }>(
    { brand: "", model: "", condition: "" }
  );
  // productEnabled fusionné avec descEnabled (un seul toggle)

  const [options, setOptions] = useState<MannequinOptions>({
    gender: "femme",
    size: "xs",
    pose: "face",
    background: "chambre",
    style: "amateur",
  });
  const [showPrompt, setShowPrompt] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(true); // animation container for advanced options
  const [imageOptsEnabled, setImageOptsEnabled] = useState(true);
  // Toggle de génération de description et état de rétraction de l'édition
  const [descEnabled, setDescEnabled] = useState(false);
  const [editCollapsed, setEditCollapsed] = useState(false);

  // Génération description Vinted depuis la carte produit
  const [descGenerating, setDescGenerating] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);
  const [descResult, setDescResult] = useState<Record<string, unknown> | null>(null);

  const GENDERS = ["femme", "homme"] as const;
  const SIZES = ["xxs", "xs", "s", "m", "l", "xl", "xxl"] as const;
  const CONDITIONS = ["neuf", "très bon état", "bon état", "satisfaisant"] as const;
  const POSES = ["face", "trois-quarts", "profil", "assis", "marche"] as const;
  const STYLES = ["professionnel", "amateur"] as const;
  const BACKGROUNDS = ["chambre", "salon", "studio", "extérieur"] as const;
  const PROVIDERS = ["vertex", "openrouter"] as const;

  const [imageProvider, setImageProvider] = useState<string>("vertex");

  const canGenerate = useMemo(
    () => Boolean(imageDataUrl && !generating),
    [imageDataUrl, generating]
  );

  const promptPreview = useMemo(
    () => buildInstruction(options || {}, undefined, "aperçu"),
    [options]
  );

  function onFiles(files?: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    fileToDataURL(file).then(setImageDataUrl).catch(() => {
      setError("Impossible de lire l'image");
    });
  }

  // (supprimé: doublon) — l'implémentation unique est plus bas

  async function generate() {
    if (!imageDataUrl) return;
    // En cliquant sur Générer: replier l'édition et ouvrir la zone résultat
    setEditCollapsed(true);
    setOptionsOpen(false);
    setGenerating(true);
    setError(null);
    setOutImages([]);
    try {
      // Ne pas scroller tout de suite; on scrollera après avoir des images
    } catch {}
    try {
      const imgRes = await fetch("/api/generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, options, count: 1, provider: imageProvider }),
      });
      const imgJson = await imgRes.json();
      if (!imgRes.ok) throw new Error(imgJson?.error || "Erreur images");
      const images = (imgJson.images || []) as string[];
      setOutImages(images);
      const item = {
        id: `${Date.now()}`,
        createdAt: Date.now(),
        source: imageDataUrl,
        results: images,
        description: null as Record<string, unknown> | null,
      };
      setCurrentItemId(item.id);
      setHistory((h) => [item, ...h].slice(0, 50));
      try {
        localStorage.setItem("vintedboost_last", JSON.stringify(item));
      } catch {}

      // Persist on server (best-effort, do not block UI)
      try {
        await fetchWithTimeout(
          "/api/history",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          },
          2000
        );
      } catch {}

      // Smoothly scroll to the results section now that it exists
      try {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {}
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Erreur");
    } finally {
      setGenerating(false);
    }
  }

  function onToggleDesc(next: boolean) {
    setDescEnabled(next);
    // A l'activation, simplement déplier les options; pas de scroll, pas de rétraction globale
    if (next) setOptionsOpen(true);
  }

  async function generateDescriptionFromPhoto() {
    if (!imageDataUrl) {
      setDescError("Veuillez d'abord ajouter la photo du vêtement");
      return;
    }
    setDescGenerating(true);
    setDescError(null);
    setDescResult(null);
    try {
      const res = await fetch("/api/describe-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          product: descEnabled
            ? {
                brand: product.brand?.trim() || null,
                model: product.model?.trim() || null,
                gender: options.gender || null,
                size: options.size || null,
                condition: (product.condition?.trim?.() || null) as string | null,
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur de génération");
      setDescResult(data);
      // attach description to current item (local history + last)
      try {
        setHistory((h) => {
          if (!currentItemId) return h;
          const next = h.map((it) => (it.id === currentItemId ? { ...it, description: data } : it));
          try { localStorage.setItem("vintedboost_history", JSON.stringify(next)); } catch {}
          try {
            const lastRaw = localStorage.getItem("vintedboost_last");
            if (lastRaw) {
              const last = JSON.parse(lastRaw);
              if (last?.id === currentItemId) {
                localStorage.setItem("vintedboost_last", JSON.stringify({ ...last, description: data }));
              }
            }
          } catch {}
          return next;
        });
      } catch {}
      // Persist description server-side on the item (PATCH) with POST fallback
      try {
        if (currentItemId) {
          const patchRes = await fetchWithTimeout(
            `/api/history/${currentItemId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ description: data }),
            },
            2000
          );
          if (!patchRes.ok) {
            // Fallback to POST upsert
            await fetchWithTimeout(
              "/api/history",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: currentItemId,
                  source: imageDataUrl!,
                  results: outImages,
                  createdAt: Date.now(),
                  description: data,
                }),
              },
              2000
            );
          }
        }
      } catch {}
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDescError(msg || "Erreur");
    } finally {
      setDescGenerating(false);
    }
  }
  useEffect(() => {
    try {
      const rawHist = localStorage.getItem("vintedboost_history");
      if (rawHist) setHistory(JSON.parse(rawHist));
      const rawLast = localStorage.getItem("vintedboost_last");
      if (rawLast) {
        const last = JSON.parse(rawLast);
        if (last?.source) setImageDataUrl(last.source);
        if (Array.isArray(last?.results)) setOutImages(last.results);
        if (last?.description) setDescResult(last.description);
        if (last?.id) setCurrentItemId(String(last.id));
      }
      const rawOpts = localStorage.getItem("vintedboost_options");
      if (rawOpts) {
        try {
          const o = JSON.parse(rawOpts) || {};
          // migration: support older keys
          if (o.morphology && !o.size) o.size = o.morphology;
          delete o.customText;
          delete o.subject; // drop legacy subject
          setOptions((prev) => ({ ...prev, ...o }));
        } catch {}
      }
      const rawImgOptsEnabled = localStorage.getItem("vintedboost_image_options_enabled");
      if (rawImgOptsEnabled != null) {
        setImageOptsEnabled(rawImgOptsEnabled === "true");
        setOptionsOpen(rawImgOptsEnabled === "true");
      }
      const rawProvider = localStorage.getItem("vintedboost_image_provider");
      if (rawProvider === "openrouter" || rawProvider === "vertex") {
        setImageProvider(rawProvider);
      }
      const rawProd = localStorage.getItem("vintedboost_product");
      if (rawProd) {
        try {
          const p = JSON.parse(rawProd) || {};
          setProduct((prev) => ({ ...prev, ...p }));
        } catch {}
      }
      const rawDescEnabled = localStorage.getItem("vintedboost_desc_enabled");
      if (rawDescEnabled != null) {
        const enabled = rawDescEnabled === "true";
        setDescEnabled(enabled);
        // Ouvrir les options si la description est activée
        if (enabled) setOptionsOpen(true);
      }
    } catch {}
    // Attempt to hydrate from server history as source of truth when available
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/history", { cache: "no-store" }, 2000);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.items)) {
            const items = (data.items as unknown[]).map((raw) => {
              const r = raw as Record<string, unknown>;
              return {
                id: String(r.id ?? ""),
                createdAt: (r.createdAt as number | string) ?? Date.now(),
                source: String(r.source ?? ""),
                results: Array.isArray(r.results)
                  ? (r.results as unknown[]).filter((x): x is string => typeof x === "string")
                  : [],
                description: (r.description as Record<string, unknown> | null) ?? null,
              };
            });
            setHistory(items);
          }
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("vintedboost_history", JSON.stringify(history));
    } catch {}
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem("vintedboost_options", JSON.stringify(options));
    } catch {}
  }, [options]);

  useEffect(() => {
    try {
      localStorage.setItem("vintedboost_product", JSON.stringify(product));
    } catch {}
  }, [product]);

  useEffect(() => {
    try {
      localStorage.setItem("vintedboost_image_options_enabled", String(imageOptsEnabled));
    } catch {}
  }, [imageOptsEnabled]);

  // plus de persistance séparée pour productEnabled (fusion avec descEnabled)

  useEffect(() => {
    try {
      localStorage.setItem("vintedboost_desc_enabled", String(descEnabled));
    } catch {}
  }, [descEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("vintedboost_image_provider", imageProvider);
    } catch {}
  }, [imageProvider]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-50 to-white text-gray-900 dark:from-gray-950 dark:to-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-screen-md px-4 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold uppercase tracking-widest">VINTEDBOOST</h1>
            <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">Try‑On</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-md p-4">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Carte fusionnée: Annonce (upload, toggle description, options) */}
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm md:col-start-1 md:row-start-1">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold uppercase tracking-wide">Annonce</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!imageDataUrl) {
                      // Camera icon state: open camera capture
                      fileInputCameraRef.current?.click();
                    } else {
                      // Upload icon state: open file picker (gallery)
                      fileInputGalleryRef.current?.click();
                    }
                  }}
                  aria-label={imageDataUrl ? "Téléverser une image" : "Prendre une photo"}
                  title={imageDataUrl ? "Téléverser" : "Prendre une photo"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
                >
                  {imageDataUrl ? (
                    // Upload icon
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M3 16.5V18A2.25 2.25 0 0 0 5.25 20.25H18.75A2.25 2.25 0 0 0 21 18V16.5" />
                      <path d="M7.5 10.5 12 6l4.5 4.5" />
                      <path d="M12 6v12" />
                    </svg>
                  ) : (
                    // Camera icon
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M9 7l1.5-2h3L15 7h3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h3z" />
                      <circle cx="12" cy="13" r="3.5" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImageDataUrl(null);
                    setOutImages([]);
                    setError(null);
                  }}
                  aria-label="Réinitialiser"
                  title="Réinitialiser"
                  disabled={!imageDataUrl}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="M16.023 9.348h4.992V4.356" />
                    <path d="M21.015 12.97a8.25 8.25 0 1 1-2.215-5.63" />
                  </svg>
                </button>
              </div>
            </div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                onFiles(e.dataTransfer.files);
              }}
              className={cx(
                "relative w-full aspect-[4/3] rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden",
                dragActive ? "border-brand-500 bg-brand-50/40 dark:bg-brand-900/20" : "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
              )}
            >
              {imageDataUrl ? (
                <Image
                  src={imageDataUrl}
                  alt="source"
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-contain"
                  unoptimized
                />
              ) : (
                <div className="text-center text-sm text-gray-600">
                  Glissez-déposez l’image du vêtement non porté
                  <div className="mt-2">ou</div>
                  <button
                    onClick={() => fileInputGalleryRef.current?.click()}
                    className="mt-2 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 hover:bg-gray-50"
                  >
                    Choisir un fichier
                  </button>
                </div>
              )}
              {/* Gallery picker (no camera capture) */}
              <input
                ref={fileInputGalleryRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => onFiles(e.target.files)}
                className="hidden"
              />
              {/* Camera capture (mobile opens camera) */}
              <input
                ref={fileInputCameraRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                capture="environment"
                onChange={(e) => onFiles(e.target.files)}
                className="hidden"
              />
            </div>

            {/* Panneau d'édition (toggle description + options + action) */}
            <div className={cx("mt-4", editCollapsed ? "hidden" : "block")}> 
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">
                  Générer la description
                </div>
                <Toggle
                  checked={descEnabled}
                  onChange={onToggleDesc}
                  ariaLabel="Activer la génération de description"
                />
              </div>
              
              {descEnabled && (
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300" htmlFor="brand">Marque</label>
                    <input
                      id="brand"
                      type="text"
                      placeholder="ex: Chanel, Nike, Zara..."
                      value={product.brand}
                      onChange={(e) => setProduct((p) => ({ ...p, brand: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">État</div>
                    <div className="flex flex-wrap gap-2">
                      {CONDITIONS.map((c) => (
                        <button
                          key={`prod-cond-top-${c}`}
                          onClick={() => setProduct((p) => ({ ...p, condition: c }))}
                          className={cx(
                            "rounded-md border px-2 py-1 text-xs",
                            product.condition === c
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300" htmlFor="model">Modèle</label>
                    <input
                      id="model"
                      type="text"
                      placeholder="Inconnu(e)"
                      value={product.model}
                      onChange={(e) => setProduct((p) => ({ ...p, model: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Genre</div>
                    <div className="flex flex-wrap gap-2">
                      {GENDERS.map((g) => (
                        <button
                          key={`prod-gender-top-${g}`}
                          onClick={() => setOptions((o) => ({ ...o, gender: g }))}
                          className={cx(
                            "rounded-md border px-2 py-1 text-xs uppercase",
                            options.gender === g
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
                          )}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Taille du vêtement</div>
                    <div className="flex flex-wrap gap-2">
                      {SIZES.map((s) => (
                        <button
                          key={`prod-size-top-${s}`}
                          onClick={() => setOptions((o) => ({ ...o, size: s }))}
                          className={cx(
                            "rounded-md border px-2 py-1 text-xs uppercase",
                            options.size === s
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
                          )}
                        >
                          {s.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* En-tête Options d'image avec toggle */}
              <div className="mt-2 mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Options d’image
                </span>
                <Toggle
                  checked={imageOptsEnabled}
                  onChange={(v) => {
                    setImageOptsEnabled(v);
                    setOptionsOpen(v);
                  }}
                  ariaLabel="Activer la modification des options d’image"
                />
              </div>
              {/* Genre/Taille toujours visibles si la description n'est pas activée */}
              {!descEnabled && (
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Genre</div>
                    <div className="flex flex-wrap gap-2">
                      {GENDERS.map((g) => (
                        <button
                          key={`gender-under-${g}`}
                          onClick={() => setOptions((o) => ({ ...o, gender: g }))}
                          className={cx(
                            "rounded-md border px-2 py-1 text-xs uppercase",
                            options.gender === g
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
                          )}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Taille du vêtement</div>
                    <div className="flex flex-wrap gap-2">
                      {SIZES.map((s) => (
                        <button
                          key={`size-under-${s}`}
                          onClick={() => setOptions((o) => ({ ...o, size: s }))}
                          className={cx(
                            "rounded-md border px-2 py-1 text-xs uppercase",
                            options.size === s
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
                          )}
                        >
                          {s.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div
                id="options-content"
                className={cx(
                  "grid grid-cols-1 gap-3 overflow-hidden transition-all duration-300 ease-in-out motion-reduce:transition-none",
                  optionsOpen && imageOptsEnabled ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                )}
              >
                {/* Options avancées modifiables seulement si imageOptsEnabled */}

                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Fournisseur</div>
                  <div className="flex flex-wrap gap-2">
                    {PROVIDERS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setImageProvider(p)}
                        className={cx(
                          "rounded-md border px-2 py-1 text-xs uppercase",
                          imageProvider === p
                            ? "bg-brand-600 text-white border-brand-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Pose</div>
                  <div className="flex flex-wrap gap-2">
                    {POSES.map((p) => (
                      <button
                        key={p}
                        onClick={() => setOptions((o) => ({ ...o, pose: p }))}
                        className={cx(
                          "rounded-md border px-2 py-1 text-xs uppercase",
                          options.pose === p
                            ? "bg-brand-600 text-white border-brand-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Style d’image</div>
                  <div className="flex flex-wrap gap-2">
                    {STYLES.map((s) => (
                      <button
                        key={s}
                        onClick={() => setOptions((o) => ({ ...o, style: s }))}
                        className={cx(
                          "rounded-md border px-2 py-1 text-xs uppercase",
                          options.style === s
                            ? "bg-brand-600 text-white border-brand-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Environnement / Fond</div>
                  <div className="flex flex-wrap gap-2">
                    {BACKGROUNDS.map((b) => (
                      <button
                        key={b}
                        onClick={() => setOptions((o) => ({ ...o, background: b }))}
                        className={cx(
                          "rounded-md border px-2 py-1 text-xs uppercase",
                          options.background === b
                            ? "bg-brand-600 text-white border-brand-600"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-800"
                        )}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Infos vêtement déplacé plus haut lorsqu'activé */}

                <div>
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Texte d’instruction</div>
                    <Toggle checked={showPrompt} onChange={setShowPrompt} ariaLabel="Afficher le texte d’instruction" />
                  </div>
                  {showPrompt && (
                    <textarea
                      readOnly
                      value={promptPreview}
                      className="w-full min-h-24 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-700 dark:text-gray-200"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => {
                  if (!canGenerate) return;
                  // Always generate images
                  generate();
                  // Conditionally generate description
                  if (descEnabled) {
                    generateDescriptionFromPhoto();
                  } else {
                    setDescResult(null);
                    setDescError(null);
                    setDescGenerating(false);
                  }
                }}
                disabled={!canGenerate}
                className={cx(
                  "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition",
                  canGenerate
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                )}
              >
                {generating
                  ? "Génération…"
                  : descEnabled
                  ? "Générer image + description"
                  : "Générer l’image"}
              </button>
            </div>
            {error ? (
              <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>
            ) : null}
          </section>

          {outImages.length > 0 ? (
            <section
              ref={resultRef}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm md:col-start-2 md:row-start-1"
            >
              <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Résultat</h2>
              <ResultsGallery sourceUrl={imageDataUrl} results={outImages} />
              {/* Description: afficher si déjà générée OU si le toggle est ON (y compris en cours/erreur) */}
              {(descResult || descEnabled || descGenerating || descError) ? (
                <div className="mt-3">
                  <DescriptionPanel
                    data={descResult}
                    generating={descEnabled ? descGenerating : false}
                    error={descEnabled ? descError : null}
                  />
                </div>
              ) : null}
              {(imageDataUrl || outImages.length > 0) ? (
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditCollapsed(false);
                      try {
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      } catch {}
                    }}
                    className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!canGenerate) return;
                      generate();
                      if (descEnabled) {
                        generateDescriptionFromPhoto();
                      } else {
                        setDescResult(null);
                        setDescError(null);
                        setDescGenerating(false);
                      }
                    }}
                    disabled={!canGenerate}
                    className={cx(
                      "rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm transition",
                      canGenerate
                        ? "bg-brand-600 text-white hover:bg-brand-700"
                        : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                    )}
                  >
                    {generating ? "Regénération…" : "Regénérer"}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>

        {/* Historique retiré de la page d'édition; géré dans /annonces */}
      </main>
    </div>
  );
}
