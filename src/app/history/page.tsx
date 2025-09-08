"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface HistoryItem {
  id: string;
  createdAt: number;
  source: string;
  results: string[];
}

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vintedboost_history");
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  const filtered = items.filter((i) =>
    new Date(i.createdAt)
      .toLocaleDateString("fr-FR")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function edit(item: HistoryItem) {
    try {
      sessionStorage.setItem(
        "vb_generate_payload",
        JSON.stringify({ imageDataUrl: item.source })
      );
      sessionStorage.setItem("vb_last_result", JSON.stringify(item));
    } catch {}
    router.push("/results");
  }

  function duplicate(item: HistoryItem) {
    const copy = { ...item, id: `${Date.now()}` };
    const next = [copy, ...items];
    setItems(next);
    try {
      localStorage.setItem("vintedboost_history", JSON.stringify(next));
    } catch {}
  }

  function remove(id: string) {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    try {
      localStorage.setItem("vintedboost_history", JSON.stringify(next));
    } catch {}
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-gray-50 to-white text-gray-900">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-screen-sm items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="text-sm text-gray-600">
            Fermer
          </button>
          <h1 className="text-base font-semibold">Historique</h1>
          <button className="text-sm text-gray-600">Filtrer</button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-sm flex-1 p-4 pb-24">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher"
          className="mb-4 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
        {filtered.length === 0 ? (
          <div className="mt-10 text-center text-sm text-gray-500">
            <p>Aucune annonce pour l&apos;instant</p>
            <button
              onClick={() => router.push("/generate")}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Créez votre première annonce
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 p-2"
              >
                <img
                  src={item.results[0] || item.source}
                  alt="miniature"
                  className="h-16 w-16 rounded-md object-cover"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">
                    {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(item.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <button
                    onClick={() => edit(item)}
                    className="rounded-md border border-gray-300 px-2 py-1"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => duplicate(item)}
                    className="rounded-md border border-gray-300 px-2 py-1"
                  >
                    Dupliquer
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-red-600"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
