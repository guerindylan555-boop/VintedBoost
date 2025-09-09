"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ResultsGallery from "@/components/ResultsGallery";
import DescriptionPanel from "@/components/DescriptionPanel";

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

export default function AnnonceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const theId = decodeURIComponent(String(id || ""));
    if (!theId) { setLoading(false); return; }

    // 1) Try localStorage history
    try {
      const raw = localStorage.getItem("vintedboost_history");
      if (raw) {
        const hist = JSON.parse(raw) as Item[];
        const found = Array.isArray(hist) ? hist.find((x) => String(x.id) === theId) : null;
        if (found) setItem(found);
      }
    } catch {}

    // 2) Try last
    try {
      if (!item) {
        const lastRaw = localStorage.getItem("vintedboost_last");
        if (lastRaw) {
          const last = JSON.parse(lastRaw) as Item;
          if (last && String(last.id) === theId) setItem(last);
        }
      }
    } catch {}

    setLoading(false);

    // 3) Best-effort server fetch (will overwrite if found)
    (async () => {
      try {
        const res = await fetchWithTimeout(`/api/history/${encodeURIComponent(theId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.id) {
          const normalized: Item = {
            id: String(data.id),
            createdAt: data.createdAt ?? Date.now(),
            source: String(data.source ?? ""),
            results: Array.isArray(data.results) ? (data.results as string[]) : [],
            description: (data.description as Record<string, unknown> | null) ?? null,
          };
          setItem(normalized);
        }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const title = useMemo(() => {
    if (!item) return "Annonce";
    const d = new Date(item.createdAt);
    return `Annonce du ${d.toLocaleString()}`;
  }, [item]);

  return (
    <div className="mx-auto max-w-screen-md p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold uppercase tracking-widest">{title}</h1>
        <button
          type="button"
          onClick={() => router.push("/annonces")}
          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Retour
        </button>
      </header>

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 backdrop-blur p-4 shadow-sm">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Résultat</h2>
        {loading ? (
          <div className="flex h-60 items-center justify-center text-sm text-gray-500 dark:text-gray-400">Chargement…</div>
        ) : !item ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Annonce introuvable.</div>
        ) : (
          <>
            <ResultsGallery sourceUrl={item.source} results={item.results} />
            {item.description ? (
              <div className="mt-3">
                <DescriptionPanel data={item.description} />
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

