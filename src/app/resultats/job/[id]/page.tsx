"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Toggle from "@/components/Toggle";
import Image from "next/image";

export default function JobResultPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState<string|null>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const jid = String(id || "");
    if (!jid) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jid)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(String((data as any)?.error || "Not found"));
        setJob(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const debug = useMemo(() => {
    if (!job) return null;
    return job?.debug || null;
  }, [job]);

  if (loading) return <div className="mx-auto max-w-screen-md p-4">Chargement…</div>;
  if (error) return <div className="mx-auto max-w-screen-md p-4 text-red-600">{error}</div>;
  if (!job) return <div className="mx-auto max-w-screen-md p-4">Introuvable</div>;

  const images: string[] = Array.isArray(job?.results?.images) ? job.results.images.filter(Boolean) : [];
  const mode = debug?.mode || job?.finalMode || "unknown";

  return (
    <div className="mx-auto max-w-screen-md p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold uppercase tracking-wide">Résultat (Job)</h1>
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Debug</span>
          <Toggle checked={showDebug} onChange={setShowDebug} ariaLabel="Afficher debug" />
        </div>
      </div>

      {showDebug && (
        <div className="mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 p-3">
          <div className="text-xs">Mode: {String(mode)}</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {job?.env_image ? (
              <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-2 py-1 text-[11px] bg-gray-50 dark:bg-gray-800">Image 1 — Arrière‑plan</div>
                <div className="relative h-40 bg-gray-50 dark:bg-gray-900">
                  <Image src={job.env_image} alt="Arrière‑plan" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" unoptimized />
                </div>
              </div>
            ) : null}
            <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-2 py-1 text-[11px] bg-gray-50 dark:bg-gray-800">{job?.env_image ? "Image 2" : "Image"} — Vêtement</div>
              <div className="relative h-40 bg-gray-50 dark:bg-gray-900">
                <Image src={job.main_image} alt="Vêtement" fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain" unoptimized />
              </div>
            </div>
          </div>
          {Array.isArray(job?.instructions) && job.instructions.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {job.instructions.map((text: string, i: number) => (
                <div key={i} className="rounded-md border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between px-2 py-1 bg-gray-50 dark:bg-gray-800">
                    <div className="text-[11px] uppercase">Pose #{i+1}</div>
                    <button type="button" onClick={()=>{ try { navigator.clipboard.writeText(text);} catch {} }} className="text-[11px] text-brand-700 hover:underline">Copier</button>
                  </div>
                  <textarea readOnly value={text} className="w-full min-h-24 resize-y bg-white dark:bg-gray-900 px-2 py-1 text-[12px]" />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {images.map((u, i) => (
          <div key={i} className="relative h-80 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
            <Image src={u} alt={`Résultat ${i+1}`} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain" unoptimized />
          </div>
        ))}
      </div>
    </div>
  );
}
