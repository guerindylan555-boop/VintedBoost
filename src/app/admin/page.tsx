"use client";

import { authClient } from "@/lib/auth-client";
import { useEffect, useState } from "react";
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
  const [s3TestImage, setS3TestImage] = useState<{ url: string; key: string } | null>(null);

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
                setS3TestImage(null);
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

      {/* S3 upload test */}
      <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">S3/CloudFront upload test</h2>
        <div className="grid gap-3">
          <div className="text-xs text-gray-600 dark:text-gray-300">Choisissez une image puis cliquez sur "Tester l'upload" pour vérifier la configuration S3/CloudFront. L'URL retournée doit charger l'image.</div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (!imageDataUrl) { setError("Sélectionnez d'abord une image en haut"); return; }
                setRunning(true);
                setError(null);
                setS3TestImage(null);
                try {
                  const res = await fetch("/api/admin/s3-test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ imageDataUrl }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(String(data?.error || "Upload failed"));
                  setS3TestImage({ url: String(data.url), key: String(data.key) });
                } catch (e: any) {
                  setError(e?.message || String(e));
                } finally {
                  setRunning(false);
                }
              }}
              disabled={!imageDataUrl || running}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {running ? "Test…" : "Tester l'upload"}
            </button>
            {s3TestImage ? (
              <a href={s3TestImage.url} target="_blank" rel="noreferrer" className="text-sm text-brand-700 underline">Voir l'image</a>
            ) : null}
          </div>
          {s3TestImage ? (
            <div className="grid gap-2">
              <div className="text-xs text-gray-600 dark:text-gray-300">URL: <a href={s3TestImage.url} target="_blank" rel="noreferrer" className="text-brand-700 underline break-all">{s3TestImage.url}</a></div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s3TestImage.url} alt="S3 test" className="max-h-48 object-contain border border-gray-200 dark:border-gray-700 rounded" />
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
