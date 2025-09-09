"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Toggle from "@/components/Toggle";

type Item = {
  id: string;
  createdAt: number | string;
  source: string;
  results: string[];
  description?: Record<string, unknown> | null;
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
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hasDescOnly, setHasDescOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [view, setView] = useState<"list" | "grid">("list");

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
      if (hasDescOnly && !it.description) return false;
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
  }, [items, query, hasDescOnly, sortOrder]);

  function openItem(it: Item) {
    try {
      localStorage.setItem("vintedboost_last", JSON.stringify(it));
    } catch {}
    router.push(`/annonces/${encodeURIComponent(String(it.id))}`);
  }

  return (
    <div className="mx-auto max-w-screen-md p-4">
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
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-gray-600 dark:text-gray-300">Avec description</span>
          <Toggle checked={hasDescOnly} onChange={setHasDescOnly} ariaLabel="Filtrer avec description" />
        </div>
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
          <div className="ml-2 inline-flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setView("list")}
              className={cx(
                "px-2 py-1 text-xs",
                view === "list" ? "bg-gray-100 dark:bg-gray-800" : "bg-transparent"
              )}
              aria-label="Vue liste"
            >
              Liste
            </button>
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cx(
                "px-2 py-1 text-xs",
                view === "grid" ? "bg-gray-100 dark:bg-gray-800" : "bg-transparent"
              )}
              aria-label="Vue grille"
            >
              Grille
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm min-h-40">
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
              href="/"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
            >
              Créer ma première annonce
            </Link>
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((h) => (
              <button
                key={h.id}
                onClick={() => openItem(h)}
                className="rounded-xl border border-gray-200 dark:border-gray-700 p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <div className="relative mb-2 aspect-[4/3] w-full overflow-hidden rounded-md border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <Image
                    src={h.source}
                    alt="source"
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-contain"
                    unoptimized
                  />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {new Date(h.createdAt).toLocaleString()}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{h.results.length} résultat(s)</span>
                    {h.description ? (
                      <span className="rounded border border-emerald-500/30 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-300">
                        Description
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((h) => (
              <button
                key={h.id}
                onClick={() => openItem(h)}
                className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <Image
                  src={h.source}
                  alt="source"
                  width={64}
                  height={64}
                  className="shrink-0 rounded-md border object-contain dark:border-gray-700"
                  unoptimized
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {new Date(h.createdAt).toLocaleString()}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{h.results.length} résultat(s)</span>
                    {h.description ? (
                      <span className="rounded border border-emerald-500/30 bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-300">
                        Description
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
