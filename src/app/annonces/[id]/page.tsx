"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useParams, useRouter } from "next/navigation";
import ResultsGallery from "@/components/ResultsGallery";
import DescriptionPanel from "@/components/DescriptionPanel";

type Item = {
  id: string;
  createdAt: number | string;
  source: string;
  results: string[];
  description?: Record<string, unknown> | null;
  status?: "draft" | "final";
  title?: string;
};

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 2000): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...(init || {}), signal: controller.signal, cache: "no-store" });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export default function AnnonceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [titleInput, setTitleInput] = useState("");
  const [editDescMode, setEditDescMode] = useState(false);
  const [descText, setDescText] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);

  useEffect(() => {
    const theId = decodeURIComponent(String(id || ""));
    if (!theId) { setLoading(false); return; }
    (async () => {
      // 1) Prefer jobs table (unified flow): show final state without retriggering
      try {
        const r = await fetchWithTimeout(`/api/jobs/${encodeURIComponent(theId)}`);
        if (r.ok) {
          const job = await r.json();
          const images = Array.isArray(job?.results?.images) ? (job.results.images as Array<string | null | undefined>).filter(Boolean) as string[] : [];
          const normalized: Item = {
            id: String(job.id || theId),
            createdAt: job.createdAt ?? Date.now(),
            source: String(job.main_image || ""),
            results: images,
            description: null,
            title: undefined,
            status: job.status === 'done' ? 'final' : 'draft',
          };
          setItem(normalized);
          setLoading(false);
          return;
        }
      } catch {}

      // 2) Fallback: history item
      try {
        const res = await fetchWithTimeout(`/api/history/${encodeURIComponent(theId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.id) {
            const normalized: Item = {
              id: String(data.id),
              createdAt: data.createdAt ?? Date.now(),
              source: String(data.source ?? ""),
              results: Array.isArray(data.results) ? (data.results as string[]) : [],
              description: (data.description as Record<string, unknown> | null) ?? null,
              title: typeof data?.description?.title === "string" ? (data.description.title as string) : undefined,
            };
            setItem(normalized);
            setLoading(false);
            return;
          }
        }
      } catch {}

      // 3) Local storage (last resort)
      try {
        const raw = localStorage.getItem("vintedboost_history");
        if (raw) {
          const hist = JSON.parse(raw) as Item[];
          const found = Array.isArray(hist) ? hist.find((x) => String(x.id) === theId) : null;
          if (found) { setItem(found); setLoading(false); return; }
        }
      } catch {}
      try {
        const lastRaw = localStorage.getItem("vintedboost_last");
        if (lastRaw) {
          const last = JSON.parse(lastRaw) as Item;
          if (last && String(last.id) === theId) { setItem(last); setLoading(false); return; }
        }
      } catch {}

      setLoading(false);
    })();
  }, [id]);

  // Hydrate editable fields when item changes
  useEffect(() => {
    if (!item) return;
    const desc = (item.description || null) as (null | { title?: string; descriptionText?: string });
    const t = (item.title || desc?.title || "").toString();
    setTitleInput(t);
    const d = (desc?.descriptionText || "").toString();
    setDescText(d);
  }, [item]);

  const headerTitle = useMemo(() => {
    if (!item) return "Annonce";
    if (titleInput.trim()) return titleInput.trim();
    const d = new Date(item.createdAt);
    return `Annonce du ${d.toLocaleString()}`;
  }, [item, titleInput]);

  async function saveEdits() {
    if (!item) return;
    setSaving(true);
    try {
      const prevDesc = (item.description || null) as (null | { title?: string; descriptionText?: string; [k: string]: unknown });
      const nextDesc: Record<string, unknown> = prevDesc ? { ...prevDesc, title: titleInput?.trim() || prevDesc.title, descriptionText: descText } : { title: titleInput?.trim() || undefined, descriptionText: descText };
      const updated: Item = { ...item, title: titleInput?.trim() || item.title, description: nextDesc };
      setItem(updated);
      // best-effort server persist
      try {
        const patch = await fetch(`/api/history/${encodeURIComponent(String(item.id))}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: nextDesc }),
        });
        if (!patch.ok) {
          await fetch(`/api/history`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id, source: item.source, results: item.results, createdAt: item.createdAt, description: nextDesc }),
          });
        }
      } catch {}
      setEditDescMode(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-screen-md p-4">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xl font-semibold uppercase tracking-widest truncate" title={headerTitle}>{headerTitle}</h1>
          {item?.status === "draft" ? (
            <span className="rounded border border-amber-500/30 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300">
              Brouillon
            </span>
          ) : null}
          {item?.status === "final" ? (
            <span className="rounded border border-teal-500/30 bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700 dark:border-teal-500/30 dark:bg-teal-900/20 dark:text-teal-300">
              Définitive
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => router.push("/annonces")}
          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Retour
        </button>
      </header>

      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Titre de l’annonce</label>
        {!editingTitle ? (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-1 min-w-0 rounded-md border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 px-3 py-2">
              <div className="truncate text-sm" title={titleInput || "Ajouter un titre"}>{titleInput || "Ajouter un titre"}</div>
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
              value={titleInput}
              onChange={(e)=>setTitleInput(e.target.value)}
              maxLength={100}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>)=>{ if (e.key === 'Enter') saveEdits(); if (e.key === 'Escape') { try { const desc = (item?.description||null) as (null|{ title?: string }); const t = ((item?.title || desc?.title || "") as string).toString(); setTitleInput(t); } catch {}; setEditingTitle(false); } }}
              className="min-w-0 grow rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              placeholder="Ex: Robe Zara noire taille S"
              autoFocus
            />
            <button onClick={async()=>{ await saveEdits(); setEditingTitle(false); }} disabled={saving} className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{saving?"Enregistrement…":"Enregistrer"}</button>
            <button
              type="button"
              onClick={() => { try { const desc = (item?.description||null) as (null|{ title?: string }); const t = ((item?.title || desc?.title || "") as string).toString(); setTitleInput(t); } catch {}; setEditingTitle(false); }}
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Résultat</h2>
        {loading ? (
          <div className="flex h-60 items-center justify-center text-sm text-gray-500 dark:text-gray-400">Chargement…</div>
        ) : !item ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Annonce introuvable.</div>
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
                    <button onClick={saveEdits} disabled={saving} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{saving?"Enregistrement…":"Enregistrer"}</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
