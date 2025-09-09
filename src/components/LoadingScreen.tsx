"use client";

type LoadingScreenProps = {
  title?: string;
  subtitle?: string;
  progress?: number | null; // 0-100, null => indeterminate
  stepLabel?: string;
  error?: string | null;
  onRetry?: () => void;
  onCancel?: () => void;
};

export default function LoadingScreen({ title = "Préparation…", subtitle, progress = null, stepLabel, error, onRetry, onCancel }: LoadingScreenProps) {
  const pct = typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : null;
  const showBar = pct != null;
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-4 p-6 text-center">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
      </div>

      {error ? (
        <div className="w-full max-w-md rounded-md border border-red-300 bg-red-50 p-3 text-left text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <div className="font-medium">Un problème est survenu</div>
          <div className="mt-1 whitespace-pre-wrap">{error}</div>
        </div>
      ) : (
        <div className="w-full max-w-md" aria-live="polite">
          <div className="mb-2 text-xs text-gray-600 dark:text-gray-300">{stepLabel || "En cours…"}</div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            {showBar ? (
              <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
            ) : (
              <div className="relative h-full w-full">
                <div className="absolute inset-0 h-full w-1/3 animate-pulse rounded-full bg-brand-600" />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        {error ? (
          <>
            {onRetry ? (
              <button onClick={onRetry} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Réessayer</button>
            ) : null}
            {onCancel ? (
              <button onClick={onCancel} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">Annuler</button>
            ) : null}
          </>
        ) : (
          onCancel ? (
            <button onClick={onCancel} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">Annuler</button>
          ) : null
        )}
      </div>
    </div>
  );
}

