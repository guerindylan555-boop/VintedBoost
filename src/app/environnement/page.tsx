"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type PersonItem = {
  id: string;
  createdAt: number | string;
  prompt: string;
  gender: "femme" | "homme";
  image: string;
  meta?: Record<string, unknown> | null;
  isDefault?: boolean;
};

function cx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function EnvironmentPage() {
  const [mode, setMode] = useState<"environnement" | "persona">("environnement");
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<"chambre" | "salon" | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Preview removed: generation auto-saves
  const [items, setItems] = useState<EnvItem[]>([]);
  const canGenerate = useMemo(() => Boolean(prompt.trim()) && !generating && Boolean(kind), [prompt, generating, kind]);
  // Persona state
  const [personaPrompt, setPersonaPrompt] = useState("");
  const [personaGender, setPersonaGender] = useState<"femme" | "homme">("femme");
  const [persons, setPersons] = useState<PersonItem[]>([]);
  const [generatingPerson, setGeneratingPerson] = useState(false);
  const canGeneratePerson = useMemo(() => Boolean(personaPrompt.trim()) && !generatingPerson, [personaPrompt, generatingPerson]);

  // Admin state: persona references (femme/homme)
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [refFemme, setRefFemme] = useState<{ id: string; image: string; prompt?: string } | null>(null);
  const [refHomme, setRefHomme] = useState<{ id: string; image: string; prompt?: string } | null>(null);
  const adminFileFRef = useRef<HTMLInputElement | null>(null);
  const adminFileHRef = useRef<HTMLInputElement | null>(null);
  const [adminBusy, setAdminBusy] = useState<"idle" | "femme" | "homme">("idle");

  useEffect(() => {
    // hydrate from local cache first
    try {
      const raw = localStorage.getItem("vintedboost_envs");
      if (raw) {
        const local = JSON.parse(raw) as EnvItem[];
        if (Array.isArray(local)) setItems(local);
      }
    } catch {}
    try {
      const rawP = localStorage.getItem("vintedboost_persons");
      if (rawP) {
        const localP = JSON.parse(rawP) as PersonItem[];
        if (Array.isArray(localP)) setPersons(localP);
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
      try {
        const resP = await fetch(`/api/persons`, { cache: "no-store" });
        if (resP.ok) {
          const dataP = (await resP.json()) as { items?: PersonItem[] };
          if (Array.isArray(dataP?.items)) {
            setPersons(dataP.items as PersonItem[]);
            try { localStorage.setItem("vintedboost_persons", JSON.stringify(dataP.items)); } catch {}
          }
        }
      } catch {}
      // Admin check and references
      try {
        const r = await fetch("/api/admin/check", { cache: "no-store" });
        if (r.ok) {
          const d = await r.json();
          setIsAdmin(Boolean(d?.isAdmin));
        } else {
          setIsAdmin(false);
        }
      } catch { setIsAdmin(false); }
      try {
        const r2 = await fetch("/api/admin/person-references", { cache: "no-store" });
        if (r2.ok) {
          const d2 = await r2.json();
          const items = Array.isArray(d2?.items) ? d2.items as Array<{ id: string; gender: string; image: string; prompt?: string }> : [];
          const f = items.find((x) => (x.gender || '').toLowerCase() === 'femme');
          const h = items.find((x) => (x.gender || '').toLowerCase() === 'homme');
          if (f) setRefFemme({ id: String(f.id), image: String(f.image), prompt: (f as any).prompt || "" });
          if (h) setRefHomme({ id: String(h.id), image: String(h.image), prompt: (h as any).prompt || "" });
        }
      } catch {}
      setAdminChecked(true);
    })();
  }, []);

  async function generate() {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    // no preview in auto-save flow
    try {
      const res = await fetch("/api/generate-environment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), kind: kind || "chambre" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String((data as any)?.error || "Échec de la génération"));
      const urls: string[] = Array.isArray((data as any)?.images)
        ? ((data as any).images as string[]).filter(Boolean)
        : [];
      if (urls.length === 0) throw new Error("Pas d'image reçue");
      // Auto-save all returned images
      const savedItems: EnvItem[] = [];
      for (const u of urls) {
        try {
          const saveRes = await fetch("/api/environments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: prompt.trim(), kind: kind || "chambre", image: u }),
          });
          const saveData = await saveRes.json();
          if (saveRes.ok && (saveData as any)?.item) {
            savedItems.push((saveData as any).item as EnvItem);
          }
        } catch {}
      }
      if (savedItems.length > 0) {
        setItems((prev) => {
          const next = [...savedItems, ...prev];
          try { localStorage.setItem("vintedboost_envs", JSON.stringify(next)); } catch {}
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
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
  const filteredPersons = useMemo(() => persons.filter((p) => p.gender === personaGender), [persons, personaGender]);

  // Admin upload helpers
  const onUploadAdminRef = useCallback(async (gender: "femme" | "homme", file?: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError("Image trop lourde (max 8MB)"); return; }
    setError(null);
    setAdminBusy(gender);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("Lecture impossible"));
        fr.readAsDataURL(file);
      });
      const res = await fetch("/api/admin/person-references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender, image: dataUrl })
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String((d as any)?.error || "Échec du téléversement"));
      const img = (d as any)?.item?.image as string | undefined;
      const id = (d as any)?.item?.id as string | undefined;
      if (gender === "femme" && img) setRefFemme({ id: id || "", image: img, prompt: "" });
      if (gender === "homme" && img) setRefHomme({ id: id || "", image: img, prompt: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdminBusy("idle");
    }
  }, []);

  // Fullscreen viewer for "Mes modèles"
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const openViewer = useCallback((idx: number) => { setViewerIndex(idx); setViewerOpen(true); }, []);
  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const nextViewer = useCallback(() => setViewerIndex((i) => (i + 1) % Math.max(filteredPersons.length, 1)), [filteredPersons.length]);
  const prevViewer = useCallback(() => setViewerIndex((i) => (i - 1 + Math.max(filteredPersons.length, 1)) % Math.max(filteredPersons.length, 1)), [filteredPersons.length]);

  useEffect(() => {
    if (!viewerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowRight') nextViewer();
      if (e.key === 'ArrowLeft') prevViewer();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerOpen, closeViewer, nextViewer, prevViewer]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-gray-50 to-white text-gray-900 dark:from-gray-950 dark:to-gray-900 dark:text-gray-100">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-100 dark:border-gray-800">
        <div className="mx-auto max-w-screen-md px-4 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold uppercase tracking-widest">{mode === 'environnement' ? 'ENVIRONNEMENT' : 'PERSONA'}</h1>
            <span className="hidden sm:inline text-sm text-gray-500 dark:text-gray-400">{mode === 'environnement' ? 'Chambre / Salon' : 'Femme / Homme'}</span>
          </div>
          <div className="flex items-center gap-3" />
        </div>
      </header>

      <main className="mx-auto max-w-screen-md p-4">
        <div className="mb-4 inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-gray-900">
          {(["environnement", "persona"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cx("px-3 py-1.5 text-sm rounded-md", mode === m ? "bg-brand-600 text-white" : "text-gray-700 dark:text-gray-200")}>
              {m === 'environnement' ? 'Environnement' : 'Persona'}
            </button>
          ))}
        </div>
        {/* Onboarding (env mode only) */}
        {mode === 'environnement' && items.length === 0 && kind === null ? (
          <div className="mx-auto max-w-sm text-center">
            <div className="mb-4 text-sm text-gray-600 dark:text-gray-300">Choisissez un type d’environnement pour commencer</div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setKind("chambre")} className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-6 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">Chambre</button>
              <button onClick={() => setKind("salon")} className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-6 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800">Salon</button>
            </div>
          </div>
        ) : null}

        {/* Tabs (env mode only) */}
        {mode === 'environnement' && items.length > 0 ? (
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
          {mode === 'environnement' ? (
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
            {/* Person controls moved to Persona tab */}

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

            {/* Preview removed: images are auto-enregistrées */}
          </section>
          ) : (
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm md:col-start-1 md:row-start-1">
            {/* Admin: références persona */}
            {adminChecked && isAdmin ? (
              <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">Références administrateur</div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Femme */}
                  <div className="rounded-md border border-gray-200 dark:border-gray-700 p-2">
                    <div className="mb-2 text-xs font-medium">Femme</div>
                    <div className="flex items-center gap-3">
                      <div className="relative h-16 w-16 overflow-hidden rounded border border-gray-200 dark:border-gray-700 bg-gray-50">
                        {refFemme?.image ? (
                          <Image src={refFemme.image} alt="réf femme" fill sizes="64px" className="object-cover" unoptimized />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-500">Aucune</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adminFileFRef.current?.click()}
                          disabled={adminBusy === 'femme'}
                          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                        >
                          {adminBusy === 'femme' ? 'Envoi…' : (refFemme ? 'Remplacer' : 'Téléverser')}
                        </button>
                        <input ref={adminFileFRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e)=>onUploadAdminRef('femme', e.target.files?.[0] || null)} />
                      </div>
                    </div>
                  </div>
                  {/* Homme */}
                  <div className="rounded-md border border-gray-200 dark:border-gray-700 p-2">
                    <div className="mb-2 text-xs font-medium">Homme</div>
                    <div className="flex items-center gap-3">
                      <div className="relative h-16 w-16 overflow-hidden rounded border border-gray-200 dark:border-gray-700 bg-gray-50">
                        {refHomme?.image ? (
                          <Image src={refHomme.image} alt="réf homme" fill sizes="64px" className="object-cover" unoptimized />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-500">Aucune</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adminFileHRef.current?.click()}
                          disabled={adminBusy === 'homme'}
                          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                        >
                          {adminBusy === 'homme' ? 'Envoi…' : (refHomme ? 'Remplacer' : 'Téléverser')}
                        </button>
                        <input ref={adminFileHRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e)=>onUploadAdminRef('homme', e.target.files?.[0] || null)} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="mb-2">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Prompt (modèle)</label>
              <textarea
                value={personaPrompt}
                onChange={(e) => setPersonaPrompt(e.target.value)}
                placeholder={personaGender === 'homme' ? "Ex: homme de face, jean, t-shirt uni, lumière douce" : "Ex: femme de face, robe simple, lumière naturelle"}
                className="w-full min-h-28 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="mb-3">
              <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-gray-900">
                {(["femme", "homme"] as const).map((g) => (
                  <button key={g} onClick={() => setPersonaGender(g)} className={cx("px-3 py-1.5 text-xs rounded-md", personaGender === g ? "bg-brand-600 text-white" : "text-gray-700 dark:text-gray-200")}>{g}</button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={async () => {
                  setGeneratingPerson(true);
                  setError(null);
                  try {
                    const res = await fetch("/api/generate-person", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: personaPrompt.trim(), gender: personaGender }) });
                    const data = await res.json();
                    if (!res.ok) throw new Error(String((data as any)?.error || "Échec de la génération"));
                    const urls: string[] = Array.isArray((data as any)?.images) ? ((data as any).images as string[]).filter(Boolean) : [];
                    if (urls.length === 0) throw new Error("Pas d'image reçue");
                    const saved: PersonItem[] = [];
                    for (const u of urls) {
                      try {
                        const fallback = personaPrompt.trim() || (personaGender === 'homme' ? 'Aléatoire (homme)' : 'Aléatoire (femme)');
                        const save = await fetch("/api/persons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: fallback, gender: personaGender, image: u }) });
                        const sd = await save.json();
                        if (save.ok && (sd as any)?.item) saved.push((sd as any).item as PersonItem);
                      } catch {}
                    }
                    if (saved.length > 0) {
                      setPersons((prev) => { const next = [...saved, ...prev]; try { localStorage.setItem("vintedboost_persons", JSON.stringify(next)); } catch {}; return next; });
                    }
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setGeneratingPerson(false);
                  }
                }}
                disabled={!canGeneratePerson || generatingPerson}
                className={cx(
                  "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold shadow-sm transition",
                  canGeneratePerson && !generatingPerson ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                )}
              >
                {generatingPerson ? "Génération…" : "Générer l’image du modèle"}
              </button>
              <button
                onClick={async () => {
                  setGeneratingPerson(true);
                  setError(null);
                  try {
                    const res = await fetch("/api/generate-person", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "", gender: personaGender }) });
                    const data = await res.json();
                    if (!res.ok) throw new Error(String((data as any)?.error || "Échec de la génération"));
                    const urls: string[] = Array.isArray((data as any)?.images) ? ((data as any).images as string[]).filter(Boolean) : [];
                    if (urls.length === 0) throw new Error("Pas d'image reçue");
                    const saved: PersonItem[] = [];
                    for (const u of urls) {
                      try {
                        const fallback = personaGender === 'homme' ? 'Aléatoire (homme)' : 'Aléatoire (femme)';
                        const save = await fetch("/api/persons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: fallback, gender: personaGender, image: u }) });
                        const sd = await save.json();
                        if (save.ok && (sd as any)?.item) saved.push((sd as any).item as PersonItem);
                      } catch {}
                    }
                    if (saved.length > 0) {
                      setPersons((prev) => { const next = [...saved, ...prev]; try { localStorage.setItem("vintedboost_persons", JSON.stringify(next)); } catch {}; return next; });
                    }
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setGeneratingPerson(false);
                  }
                }}
                disabled={generatingPerson}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
                title="Générer sans texte (aléatoire)"
              >
                Aléatoire
              </button>
            </div>
            {error ? <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div> : null}
          </section>
          )}

          {mode === 'environnement' ? (
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
          ) : (
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold uppercase tracking-wide">Mes modèles</h2>
              <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-white dark:bg-gray-900">
                {(["femme", "homme"] as const).map((g) => (
                  <button key={g} onClick={() => setPersonaGender(g)} className={cx("px-3 py-1.5 text-xs rounded-md", personaGender === g ? "bg-brand-600 text-white" : "text-gray-700 dark:text-gray-200")}>{g}</button>
                ))}
              </div>
            </div>
            {filteredPersons.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Aucun modèle sauvegardé.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredPersons.map((it, idx) => (
                  <div key={it.id} className={cx("group overflow-hidden rounded-xl border bg-white/60 dark:bg-gray-900/60", it.isDefault ? "border-brand-600 dark:border-brand-600" : "border-gray-200 dark:border-gray-700") }>
                    <div className="relative h-40 bg-gray-50 dark:bg-gray-900 cursor-zoom-in" onClick={() => openViewer(idx)}>
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
                              const res = await fetch(`/api/persons/${encodeURIComponent(String(it.id))}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: it.isDefault ? "unset-default" : "set-default" }) });
                              if (!res.ok) throw new Error("Action impossible");
                              const r = await fetch(`/api/persons`, { cache: "no-store" });
                              if (r.ok) {
                                const data = await r.json();
                                if (Array.isArray((data as any)?.items)) {
                                  setPersons((data as any).items as PersonItem[]);
                                  try { localStorage.setItem("vintedboost_persons", JSON.stringify((data as any).items)); } catch {}
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
                          onClick={async () => { try { const d = await fetch(`/api/persons/${encodeURIComponent(String(it.id))}`, { method: 'DELETE' }); if (d.ok) setPersons((prev)=>{ const next = prev.filter((x)=>x.id!==it.id); try{ localStorage.setItem('vintedboost_persons', JSON.stringify(next)); } catch{}; return next; }); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }}
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
          )}
        </div>
      </main>
      {/* Fullscreen Viewer Modal */}
      {viewerOpen && filteredPersons.length > 0 ? (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={closeViewer}>
          <div className="relative max-w-[92vw] max-h-[92vh]" onClick={(e)=>e.stopPropagation()}>
            <div className="relative w-[80vw] max-w-[900px] aspect-[4/5] bg-black/20 rounded-lg overflow-hidden">
              <Image src={filteredPersons[viewerIndex].image} alt={filteredPersons[viewerIndex].prompt} fill sizes="90vw" className="object-contain" unoptimized />
              <div className="absolute left-2 top-2 rounded-md bg-white/85 dark:bg-gray-900/80 px-2 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300">
                {new Date(filteredPersons[viewerIndex].createdAt).toLocaleString()}
              </div>
              <a
                href={filteredPersons[viewerIndex].image}
                download={`persona_${viewerIndex + 1}.png`}
                className="absolute right-2 top-2 rounded-md bg-white/85 dark:bg-gray-900/80 px-2 py-1 text-xs text-gray-800 dark:text-gray-100"
                title="Télécharger"
              >
                Télécharger
              </a>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button onClick={prevViewer} className="rounded-md bg-white/90 px-3 py-1 text-sm text-gray-800">Précédent</button>
              <button onClick={closeViewer} className="rounded-md bg-white/90 px-3 py-1 text-sm text-gray-800">Fermer</button>
              <button onClick={nextViewer} className="rounded-md bg-white/90 px-3 py-1 text-sm text-gray-800">Suivant</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
