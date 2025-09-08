"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildInstruction, type MannequinOptions } from "@/lib/prompt";
import Toggle from "@/components/Toggle";
import ThemeToggle from "@/components/ThemeToggle";

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
    { id: string; createdAt: number; source: string; results: string[] }[]
  >([]);

  // Informations sur le vêtement (marque, modèle) + toggle d'activation
  const [product, setProduct] = useState<{ brand: string; model: string }>(
    { brand: "", model: "" }
  );
  const [productEnabled, setProductEnabled] = useState(false);

  const [options, setOptions] = useState<MannequinOptions>({
    gender: "femme",
    size: "xs",
    pose: "face",
    background: "chambre",
    style: "amateur",
  });
  const [showPrompt, setShowPrompt] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(true);

  // Génération description Vinted depuis la carte produit
  const [descGenerating, setDescGenerating] = useState(false);
  const [descError, setDescError] = useState<string | null>(null);
  const [descResult, setDescResult] = useState<Record<string, unknown> | null>(null);

  const GENDERS = ["femme", "homme"] as const;
  const SIZES = ["xxs", "xs", "s", "m", "l", "xl", "xxl"] as const;
  const POSES = ["face", "trois-quarts", "profil", "assis", "marche"] as const;
  const STYLES = ["professionnel", "amateur"] as const;
  const BACKGROUNDS = ["chambre", "salon", "studio", "extérieur"] as const;

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
          product,
          options,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur de génération");
      setDescResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setDescError(msg || "Erreur");
    } finally {
      setDescGenerating(false);
    }
  }

  async function generate() {
    if (!imageDataUrl) return;
    setOptionsOpen(false); // collapse options on generate
    setGenerating(true);
    setError(null);
    setOutImages([]);
    try {
      // Smoothly scroll to the results section
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {}
    try {
      const imgRes = await fetch("/api/generate-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl, options, count: 1 }),
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
      };
      setHistory((h) => [item, ...h].slice(0, 50));
      try {
        localStorage.setItem("vintedboost_last", JSON.stringify(item));
      } catch {}

      // Persist on server (Vercel Postgres)
      try {
        await fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
      } catch {}
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || "Erreur");
    } finally {
      setGenerating(false);
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
      const rawProd = localStorage.getItem("vintedboost_product");
      if (rawProd) {
        try {
          const p = JSON.parse(rawProd) || {};
          setProduct((prev) => ({ ...prev, ...p }));
        } catch {}
      }
      const rawProdEnabled = localStorage.getItem("vintedboost_product_enabled");
      if (rawProdEnabled != null) {
        setProductEnabled(rawProdEnabled === "true");
      }
    } catch {}
    // Attempt to hydrate from server history as source of truth when available
    (async () => {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.items)) setHistory(data.items);
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
      localStorage.setItem("vintedboost_product_enabled", String(productEnabled));
    } catch {}
  }, [productEnabled]);

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
          {/* Carte d'informations sur le vêtement */}
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm md:col-start-1 md:row-start-1">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold uppercase tracking-wide">Infos vêtement</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-600 dark:text-gray-300">Activer</span>
                <Toggle checked={productEnabled} onChange={setProductEnabled} ariaLabel="Activer les infos vêtement" />
              </div>
            </div>
            {productEnabled && (
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300" htmlFor="brand">Marque</label>
                <input
                  id="brand"
                  type="text"
                  placeholder="ex: Nike, Zara, Levi's..."
                  value={product.brand}
                  onChange={(e) => setProduct((p) => ({ ...p, brand: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300" htmlFor="model">Modèle</label>
                <input
                  id="model"
                  type="text"
                  placeholder="ex: Air Max 90, Veste Trucker..."
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
                      key={`prod-gender-${g}`}
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
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Taille</div>
                <div className="flex flex-wrap gap-2">
                  {SIZES.map((s) => (
                    <button
                      key={`prod-size-${s}`}
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
              <div className="pt-2">
                <button
                  type="button"
                  onClick={generateDescriptionFromPhoto}
                  disabled={!imageDataUrl || descGenerating}
                  className={cx(
                    "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold shadow-sm",
                    imageDataUrl && !descGenerating
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                  )}
                  title={!imageDataUrl ? "Ajoutez d'abord la photo" : "Générer description"}
                >
                  {descGenerating ? "Génération…" : "Générer description Vinted"}
                </button>
                {descError ? (
                  <div className="mt-2 text-xs text-red-600 dark:text-red-400">{descError}</div>
                ) : null}
                {descResult ? (
                  <div className="mt-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 p-2">
                    <div className="text-[10px] uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-1">Description générée</div>
                    <textarea
                      readOnly
                      className="w-full min-h-28 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-2 text-xs"
                      value={(() => {
                        try {
                          const d = descResult as Record<string, unknown>;
                          const titleVal = d["title"];
                          const title = typeof titleVal === "string" ? titleVal : "";
                          const bulletsRaw = d["bulletPoints"];
                          const bulletsArr = Array.isArray(bulletsRaw) ? (bulletsRaw as unknown[]) : [];
                          const bullets = bulletsArr
                            .filter((x): x is string => typeof x === "string")
                            .map((b) => `• ${b}`)
                            .join("\n");
                          const textVal = d["descriptionText"];
                          const text = typeof textVal === "string" ? textVal : "";
                          const brandVal = d["brand"];
                          const brand = typeof brandVal === "string" && brandVal ? `Marque: ${brandVal}\n` : "";
                          const modelVal = d["model"];
                          const model = typeof modelVal === "string" && modelVal ? `Modèle: ${modelVal}\n` : "";
                          return [title, brand + model, bullets, text].filter(Boolean).join("\n\n").trim() || JSON.stringify(d, null, 2);
                        } catch {
                          return JSON.stringify(descResult, null, 2);
                        }
                      })()}
                    />
                  </div>
                ) : null}
              </div>
            </div>
            )}
          </section>
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm md:col-start-1 md:row-start-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold uppercase tracking-wide">Votre photo</h2>
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
                <img
                  src={imageDataUrl}
                  alt="source"
                  className="h-full w-full object-contain"
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
                accept="image/*"
                onChange={(e) => onFiles(e.target.files)}
                className="hidden"
              />
              {/* Camera capture (mobile opens camera) */}
              <input
                ref={fileInputCameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onFiles(e.target.files)}
                className="hidden"
              />
            </div>

            <div className="mt-4">
              <button
                type="button"
                aria-expanded={optionsOpen}
                aria-controls="options-content"
                onClick={() => setOptionsOpen((v) => !v)}
                className="mb-2 flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Options d’image
                </span>
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cx(
                    "h-4 w-4 text-gray-500 transition-transform duration-300 ease-in-out motion-reduce:transition-none",
                    optionsOpen ? "rotate-180" : "rotate-0"
                  )}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <div
                id="options-content"
                className={cx(
                  "grid grid-cols-1 gap-3 overflow-hidden transition-all duration-300 ease-in-out motion-reduce:transition-none",
                  optionsOpen ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                )}
              >
                {!productEnabled && (
                  <>
                    <div>
                      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Genre</div>
                      <div className="flex flex-wrap gap-2">
                        {GENDERS.map((g) => (
                          <button
                            key={g}
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
                            key={s}
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
                  </>
                )}

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
                onClick={generate}
                disabled={!canGenerate}
                className={cx(
                  "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition",
                  canGenerate
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                )}
              >
                {generating ? "Génération…" : "Générer l’image portée"}
              </button>
            </div>
            {error ? (
              <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>
            ) : null}
          </section>

          <section
            ref={resultRef}
            className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm md:col-start-2 md:row-start-1"
          >
            <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Résultat</h2>
            {generating ? (
              <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400" role="status" aria-live="polite">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent dark:border-brand-400 dark:border-t-transparent" aria-hidden="true" />
                <div>Génération en cours…</div>
              </div>
            ) : outImages.length === 0 ? (
              <div className="flex h-full min-h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Aucune image générée pour l’instant.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {outImages.map((u, i) => (
                  <a
                    key={i}
                    href={u}
                    download={`tryon_${i + 1}.png`}
                    className="group relative block overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
                    title="Télécharger"
                  >
                    <img
                      src={u}
                      alt={`sortie ${i + 1}`}
                      className="w-full object-cover"
                      style={{ aspectRatio: "4 / 5" }}
                    />
                    <div className="absolute right-2 top-2 rounded-md bg-black/60 dark:bg-black/70 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                      Télécharger
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold uppercase tracking-wide">Historique</h2>
            {history.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    try {
                      const blob = new Blob([
                        JSON.stringify(history, null, 2),
                      ], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "vintedboost_history.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {}
                  }}
                  className="text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Exporter
                </button>
                <button
                  onClick={() => setHistory([])}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  Effacer
                </button>
              </div>
            )}
          </div>
          {history.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Aucune génération enregistrée pour l’instant.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setImageDataUrl(h.source);
                    setOutImages(h.results || []);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <img
                    src={h.source}
                    alt="source"
                    className="h-16 w-16 shrink-0 rounded-md border object-contain dark:border-gray-700"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {new Date(h.createdAt).toLocaleString()}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>{h.results.length} résultat(s)</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
