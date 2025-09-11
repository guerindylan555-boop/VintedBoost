"use client";

import { authClient } from "@/lib/auth-client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const user = session?.user || null;
  const [adminLoading, setAdminLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<null | { id: string; descriptionText: string; removedPersons?: boolean; saved?: boolean }>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedDescs, setSavedDescs] = useState<Array<{ id: string; createdAt: string; source: string; descriptionText: string }>>([]);

  // Bulk describe state
  type BulkStatus = "queued" | "processing" | "success" | "error";
  type BulkItem = {
    localId: string;
    name: string;
    size: number;
    previewUrl: string; // data URL
    status: BulkStatus;
    error?: string | null;
    result?: { id: string; descriptionText: string } | null;
  };
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const bulkStats = useMemo(() => {
    const total = bulkItems.length;
    const completed = bulkItems.filter((i) => i.status === "success" || i.status === "error").length;
    const success = bulkItems.filter((i) => i.status === "success").length;
    const failed = bulkItems.filter((i) => i.status === "error").length;
    return { total, completed, success, failed };
  }, [bulkItems]);

  useEffect(() => {
    if (isPending) return;
    if (!user) { router.replace("/auth?next=/admin"); return; }
    (async () => {
      try {
        const res = await fetch("/api/admin/check", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(Boolean(data?.isAdmin));
          if (!data?.isAdmin) router.replace("/creer");
        } else {
          setIsAdmin(false);
          router.replace("/creer");
        }
      } catch {
        setIsAdmin(false);
        router.replace("/creer");
      } finally {
        setAdminLoading(false);
      }
    })();
  }, [isPending, user?.email]);

  useEffect(() => {
    // Load recent admin extracts from history
    (async () => {
      try {
        const r = await fetch('/api/history', { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json() as { items?: Array<{ id: string; createdAt: string; source: string; description?: any }> };
        const items = Array.isArray(data?.items) ? data.items : [];
        const onlyAdminExtracts = items
          .filter((it) => it?.description && (it.description.origin === 'admin_extract_v1' || it.description.removedPersons))
          .map((it) => ({ id: it.id, createdAt: String(it.createdAt), source: String(it.source), descriptionText: String(it.description?.descriptionText || '') }));
        setSavedDescs(onlyAdminExtracts);
      } catch {}
    })();
  }, []);

  if (isPending || !user || adminLoading) {
    return <div className="mx-auto max-w-screen-md p-4">Chargement…</div>;
  }
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="mx-auto max-w-screen-md p-4">
      <h1 className="text-xl font-semibold uppercase tracking-widest">Admin</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Image tools for admins only.</p>
      <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Describe background only (no people, no clothing)</h2>
        <div className="grid gap-3">
          <div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 8 * 1024 * 1024) { setError("Image too large (max 8MB)"); return; }
                setError(null);
                const reader = new FileReader();
                reader.onload = () => setImageDataUrl(String(reader.result));
                reader.onerror = () => setError("Failed to read file");
                reader.readAsDataURL(f);
              }}
            />
          </div>
          {imageDataUrl ? (
            <div className="relative w-full aspect-[4/3] overflow-hidden rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageDataUrl} alt="preview" className="h-full w-full object-contain" />
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (!imageDataUrl) { setError("Select an image first"); return; }
                setRunning(true);
                setError(null);
                setResult(null);
                try {
                  const res = await fetch("/api/admin/describe-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imageDataUrl }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(String(data?.error || "Failed"));
                  setResult(data);
                } catch (e: any) {
                  setError(e?.message || String(e));
                } finally {
                  setRunning(false);
                }
              }}
              disabled={!imageDataUrl || running}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {running ? "Extracting…" : "Extract background description (≥1000 words)"}
            </button>
            <button
              onClick={() => { setImageDataUrl(null); setResult(null); setError(null); }}
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Reset
            </button>
          </div>
          {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}
          {result ? (
            <div className="mt-2 grid gap-2">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{result.descriptionText}</pre>
              <div className="flex items-center gap-2">
                <button onClick={() => { try { navigator.clipboard.writeText(result.descriptionText); } catch {} }} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm">Copy</button>
                <span className="text-xs text-emerald-700 dark:text-emerald-300">Saved ✓ (id: {result.id})</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Bulk describe */}
      <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Bulk describe backgrounds (up to 50 images)</h2>
        <div className="grid gap-3">
          <div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                setBulkErr(null);
                const selected = files.slice(0, 50);
                // Read all files as data URLs, skipping those >8MB
                const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
                  const fr = new FileReader();
                  fr.onload = () => resolve(String(fr.result));
                  fr.onerror = () => reject(new Error("Failed to read file"));
                  fr.readAsDataURL(file);
                });
                try {
                  const items: BulkItem[] = [];
                  for (const f of selected) {
                    if (f.size > 8 * 1024 * 1024) {
                      items.push({
                        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        name: f.name,
                        size: f.size,
                        previewUrl: "",
                        status: "error",
                        error: "Image too large (max 8MB)",
                        result: null,
                      });
                      continue;
                    }
                    const dataUrl = await readAsDataUrl(f);
                    items.push({
                      localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                      name: f.name,
                      size: f.size,
                      previewUrl: dataUrl,
                      status: "queued",
                      error: null,
                      result: null,
                    });
                  }
                  setBulkItems(items);
                } catch (err: any) {
                  setBulkErr(err?.message || String(err));
                }
              }}
            />
          </div>
          {bulkItems.length > 0 ? (
            <div className="grid gap-3">
              <div className="flex items-center gap-2">
                <button
                  disabled={bulkRunning || bulkItems.every((i) => i.status !== "queued")}
                  onClick={async () => {
                    setBulkErr(null);
                    setBulkRunning(true);
                    try {
                      const concurrency = 10; // safe parallelism
                      let nextIndex = 0;
                      const total = bulkItems.length;
                      const runOne = async () => {
                        let myIndex = -1;
                        // Claim next queued item
                        await new Promise<void>((resolve) => {
                          setBulkItems((prev) => {
                            const idx = prev.findIndex((it, i) => i >= nextIndex && it.status === "queued");
                            if (idx === -1) { resolve(); return prev; }
                            nextIndex = idx + 1;
                            myIndex = idx;
                            const copy = [...prev];
                            copy[idx] = { ...copy[idx], status: "processing", error: null };
                            resolve();
                            return copy;
                          });
                        });
                        if (myIndex === -1) return; // nothing to do
                        const item = bulkItems[myIndex] || null;
                        const imageDataUrl = (item?.previewUrl || "");
                        try {
                          const res = await fetch("/api/admin/describe-image", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ imageDataUrl }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(String(data?.error || "Failed"));
                          setBulkItems((prev) => {
                            const copy = [...prev];
                            copy[myIndex] = {
                              ...copy[myIndex],
                              status: "success",
                              result: { id: String(data.id || ""), descriptionText: String(data.descriptionText || "") },
                            };
                            return copy;
                          });
                        } catch (e: any) {
                          setBulkItems((prev) => {
                            const copy = [...prev];
                            copy[myIndex] = { ...copy[myIndex], status: "error", error: e?.message || String(e) };
                            return copy;
                          });
                        }
                        // Chain next
                        await runOne();
                      };
                      // Launch pool
                      const workers = Array.from({ length: Math.min(concurrency, total) }, () => runOne());
                      await Promise.all(workers);
                    } catch (err: any) {
                      setBulkErr(err?.message || String(err));
                    } finally {
                      setBulkRunning(false);
                    }
                  }}
                  className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {bulkRunning ? "Extracting…" : "Start extraction"}
                </button>
                <button
                  onClick={() => { setBulkItems([]); setBulkErr(null); }}
                  className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Reset
                </button>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {bulkStats.completed}/{bulkStats.total} done · {bulkStats.success} ok · {bulkStats.failed} failed
                </div>
              </div>
              {bulkErr ? <div className="text-sm text-red-600 dark:text-red-400">{bulkErr}</div> : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {bulkItems.map((it, idx) => (
                  <div key={it.localId} className="rounded-md border border-gray-200 dark:border-gray-700 p-3 bg-white/60 dark:bg-gray-900/60">
                    <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span className="truncate max-w-[60%]" title={it.name}>{it.name}</span>
                      <span>{(it.size / 1024).toFixed(0)} KB</span>
                    </div>
                    <div className="grid gap-2">
                      <div className="relative h-28 rounded border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {it.previewUrl ? (<img src={it.previewUrl} alt={it.name} className="h-full w-full object-contain" />) : (
                          <div className="h-full w-full flex items-center justify-center text-xs text-gray-500">No preview</div>
                        )}
                      </div>
                      {it.status === "processing" ? (
                        <div className="text-xs text-blue-700 dark:text-blue-300">Processing…</div>
                      ) : null}
                      {it.status === "error" ? (
                        <div className="text-xs text-red-700 dark:text-red-300">{it.error || "Failed"}</div>
                      ) : null}
                      {it.status === "success" && it.result ? (
                        <div className="grid gap-2">
                          <pre className="whitespace-pre-wrap text-xs max-h-28 overflow-auto">{it.result.descriptionText}</pre>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { try { navigator.clipboard.writeText(it.result!.descriptionText); } catch {} }}
                              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs"
                            >
                              Copy
                            </button>
                            <span className="text-[10px] text-emerald-700 dark:text-emerald-300">Saved ✓ (id: {it.result.id})</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Saved descriptions */}
      <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Saved background descriptions</h2>
        {savedDescs.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">No saved admin descriptions yet.</div>
        ) : (
          <div className="grid gap-3">
            {savedDescs.map((d) => (
              <div key={d.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-3 bg-white/60 dark:bg-gray-900/60">
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>ID: {d.id}</span>
                  <span>{new Date(d.createdAt).toLocaleString()}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="relative h-32 rounded border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.source} alt="source" className="h-full w-full object-contain" />
                  </div>
                  <pre className="whitespace-pre-wrap text-xs max-h-32 overflow-auto">{d.descriptionText}</pre>
                </div>
                <div className="mt-2 flex items-center justify-end">
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/history/${encodeURIComponent(d.id)}`, { method: 'DELETE' });
                        if (res.ok) setSavedDescs((prev) => prev.filter((x) => x.id !== d.id));
                      } catch {}
                    }}
                    className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
