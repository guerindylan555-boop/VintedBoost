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
  const [result, setResult] = useState<null | { id: string; title?: string; descriptionText: string; attributes?: Record<string, unknown>; removedPersons?: boolean; saved?: boolean }>(null);
  const [error, setError] = useState<string | null>(null);

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
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Describe image (no people)</h2>
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
              {running ? "Extracting…" : "Extract description"}
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
              {result.title ? <div className="text-sm font-semibold">{result.title}</div> : null}
              <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{result.descriptionText}</pre>
              {result.attributes ? (
                <details className="rounded-md border border-gray-200 dark:border-gray-700 p-2 text-sm">
                  <summary className="cursor-pointer">Attributes</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs opacity-90">{JSON.stringify(result.attributes, null, 2)}</pre>
                </details>
              ) : null}
              <div className="flex items-center gap-2">
                <button onClick={() => { try { navigator.clipboard.writeText(result.descriptionText); } catch {} }} className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm">Copy</button>
                <span className="text-xs text-emerald-700 dark:text-emerald-300">Saved ✓ (id: {result.id})</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
