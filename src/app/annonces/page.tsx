"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
 

type Item = {
  id: string;
  createdAt: number | string;
  source: string;
  results: string[];
  description?: Record<string, unknown> | null;
  status?: "draft" | "final";
  title?: string;
};

function cx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}

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

export default function MesAnnoncesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [actionItem, setActionItem] = useState<Item | null>(null);

  // Hydrate from localStorage first
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vintedboost_history");
      if (raw) {
        const local = JSON.parse(raw) as Item[];
        if (Array.isArray(local)) setItems(local);
      }
    } catch {}
    setLoading(false);
  }, []);

  // Try server as source of truth (best-effort)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/history", undefined, 2000);
        if (!res.ok) return; // silently ignore (unauthorized or offline)
        const data = (await res.json()) as { items?: unknown[] };
        if (!Array.isArray(data?.items)) return;
        const normalized: Item[] = data.items.map((raw) => {
          const r = raw as Record<string, unknown>;
          return {
            id: String(r.id ?? ""),
            createdAt: (r.createdAt as number | string) ?? Date.now(),
            source: String(r.source ?? ""),
            results: Array.isArray(r.results) ? (r.results as string[]) : [],
            description: (r.description as Record<string, unknown> | null) ?? null,
          };
        });
        setItems(normalized);
      } catch {
        // ignore
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = items.filter((it) => {
      if (!q) return true;
      const hay = [
        new Date(it.createdAt).toLocaleString().toLowerCase(),
        String(it.id).toLowerCase(),
        it.description ? JSON.stringify(it.description).toLowerCase() : "",
      ].join(" ");
      return hay.includes(q);
    });
    const sorted = base.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return sortOrder === "desc" ? tb - ta : ta - tb;
    });
    return sorted;
  }, [items, query, sortOrder]);

  function openItem(it: Item) {
    try {
      localStorage.setItem("vintedboost_last", JSON.stringify(it));
    } catch {}
    router.push(`/annonces/${encodeURIComponent(String(it.id))}`);
  }

  async function duplicateItem(it: Item) {
    const newId = (typeof crypto !== "undefined" && (crypto as unknown as { randomUUID?: () => string }).randomUUID)
      ? (crypto as unknown as { randomUUID: () => string }).randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const clone: Item = {
      id: newId,
      createdAt: Date.now(),
      source: it.source,
      results: [...it.results],
      description: it.description ? { ...(it.description as Record<string, unknown>) } : null,
      status: it.status,
      title: it.title,
    };
    setItems((prev) => [clone, ...prev]);
    try {
      const raw = localStorage.getItem("vintedboost_history");
      const local = raw ? (JSON.parse(raw) as Item[]) : [];
      const next = Array.isArray(local) ? [clone, ...local] : [clone];
      localStorage.setItem("vintedboost_history", JSON.stringify(next));
    } catch {}
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: clone.id,
          source: clone.source,
          results: clone.results,
          createdAt: clone.createdAt,
          description: clone.description ?? null,
        }),
      });
    } catch {}
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((x) => String(x.id) !== String(id)));
    try {
      const raw = localStorage.getItem("vintedboost_history");
      const local = raw ? (JSON.parse(raw) as Item[]) : [];
      const next = Array.isArray(local) ? local.filter((x) => String(x.id) !== String(id)) : [];
      localStorage.setItem("vintedboost_history", JSON.stringify(next));
      const lastRaw = localStorage.getItem("vintedboost_last");
      if (lastRaw) {
        const last = JSON.parse(lastRaw) as Item;
        if (String(last?.id) === String(id)) localStorage.removeItem("vintedboost_last");
      }
    } catch {}
    try {
      await fetch(`/api/history/${encodeURIComponent(String(id))}`, { method: "DELETE" });
    } catch {}
  }

  return (
    <div className="mx-auto max-w-screen-md p-4 overflow-x-hidden">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold uppercase tracking-widest">Mes annonces</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Retrouvez vos annonces générées et reprenez là où vous en étiez.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher"
              className="pl-8 pr-3 h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            />
          </div>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-gray-600 dark:text-gray-300">Tri</label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "desc" | "asc")}
            className="h-8 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
          >
            <option value="desc">Plus récent</option>
            <option value="asc">Plus ancien</option>
          </select>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm min-h-40 overflow-x-hidden">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-2 animate-pulse">
                <div className="h-16 w-16 rounded-md bg-gray-200 dark:bg-gray-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
                  <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Image src="/file.svg" alt="empty" width={64} height={64} className="opacity-70" />
            <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">Aucune annonce trouvée.</div>
            <Link
              href="/creer"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              Créer ma première annonce
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((h) => (
              <div
                key={h.id}
                onClick={() => openItem(h)}
                className="group relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 text-left hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
              >
                <div className="w-full overflow-hidden border-b border-gray-100 dark:border-gray-800">
                  <div className="grid grid-cols-2 gap-1">
                    <div className="relative h-40 bg-gray-50 dark:bg-gray-900">
                      <Image
                        src={h.source}
                        alt="image source"
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="object-contain"
                        unoptimized
                      />
                      <div className="absolute left-2 top-2 rounded-md bg-white/85 dark:bg-gray-900/80 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:text-gray-300">Source</div>
                    </div>
                    <div className="relative h-40 bg-gray-50 dark:bg-gray-900">
                      {h.results[0] ? (
                        <Image
                          src={h.results[0]}
                          alt="image générée"
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Image src="/file.svg" alt="placeholder" width={24} height={24} className="opacity-60" />
                        </div>
                      )}
                      <div className="absolute left-2 top-2 rounded-md bg-white/85 dark:bg-gray-900/80 px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:text-gray-300">Générée</div>
                    </div>
                  </div>
                </div>
                <div className="p-3 min-w-0">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {(() => {
                          const desc = (h.description || null) as (null | { title?: string; descriptionText?: string });
                          return h.title?.trim() || (desc?.title || "").toString() || new Date(h.createdAt).toLocaleString();
                        })()}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="truncate">{h.results.length} résultat(s)</span>
                        {h.status === "draft" ? (
                          <span className="rounded border border-amber-500/30 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-300">
                            Brouillon
                          </span>
                        ) : null}
                        {h.status === "final" ? (
                          <span className="rounded border border-teal-500/30 bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-700 dark:border-teal-500/30 dark:bg-teal-900/20 dark:text-teal-300">
                            Définitive
                          </span>
                        ) : null}
                        {h.description ? (
                          <span className="rounded border border-emerald-500/30 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-300">
                            Description
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <button
                        type="button"
                        aria-label="Actions"
                        onClick={(e) => { e.stopPropagation(); setActionItem(h); }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                          <path d="M12 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {actionItem ? (
        <div
          className="fixed inset-0 z-20" 
          onClick={() => setActionItem(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div 
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-2xl"
            style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-700" />
            <div className="text-sm font-medium truncate" title={(() => { const d = (actionItem?.description||null) as (null|{ title?: string }); return (actionItem?.title || d?.title || actionItem?.id || "").toString(); })()}>
              {(() => { const d = (actionItem?.description||null) as (null|{ title?: string }); return (actionItem?.title || d?.title || actionItem?.id || "").toString(); })()}
            </div>
            <div className="mt-2 grid">
              <button className="px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md" onClick={() => { const it = actionItem; setActionItem(null); if (it) openItem(it); }}>Voir</button>
              <button className="px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md" onClick={() => { const it = actionItem; setActionItem(null); if (it) openItem(it); }}>Éditer</button>
              <button className="px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md" onClick={async () => { const it = actionItem; setActionItem(null); if (it) await duplicateItem(it); }}>Dupliquer</button>
              <button className="px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md" onClick={async () => { const it = actionItem; setActionItem(null); if (it) await deleteItem(it.id); }}>Supprimer</button>
              <button className="px-3 py-2 text-left text-sm opacity-50 cursor-default rounded-md" disabled aria-disabled="true" title="Disponible bientôt">Booster (bientôt)</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
