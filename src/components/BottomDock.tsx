"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomDock() {
  const pathname = usePathname() || "";
  const isAnnonces = pathname.startsWith("/annonces");
  const isCreer = pathname === "/creer";
  const isEnv = pathname.startsWith("/environnement");
  const isParams = pathname.startsWith("/parametres");
  const isAdmin = pathname.startsWith("/admin");

  const linkClasses = (active: boolean) => [
    "flex flex-col items-center justify-center gap-1 rounded-md py-2",
    active
      ? "bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
      : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800",
  ].join(" ");

  const labelClasses = (active: boolean) => [
    "text-[10px] uppercase tracking-wider",
    active ? "font-semibold" : "font-medium",
  ].join(" ");
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 border-t border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Navigation principale"
    >
      <div className="mx-auto max-w-screen-md px-4">
        <div className="grid grid-cols-5 gap-2 py-2">
          <Link href="/annonces" className={linkClasses(isAnnonces)} aria-label="Mes annonces">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M9 6h12M9 12h12M9 18h12" />
              <path d="M5 6h.01M5 12h.01M5 18h.01" />
            </svg>
            <span className={labelClasses(isAnnonces)}>Mes annonces</span>
          </Link>

          <Link href="/creer" className={linkClasses(isCreer)} aria-label="Créer une annonce">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <circle cx="12" cy="12" r="6" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            <span className={labelClasses(isCreer)}>Créer</span>
          </Link>

          <Link href="/environnement" className={linkClasses(isEnv)} aria-label="Environnement">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M3 18V9a2 2 0 0 1 2-2h8a4 4 0 0 1 4 4v7" />
              <path d="M3 18h18" />
              <path d="M6 11h6" />
            </svg>
            <span className={labelClasses(isEnv)}>Env.</span>
          </Link>

          <Link href="/parametres" className={linkClasses(isParams)} aria-label="Paramètres">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <circle cx="12" cy="12" r="3.25" />
              <path d="M12 2.5V5.5M12 18.5V21.5M2.5 12H5.5M18.5 12H21.5M4.8 4.8l2.1 2.1M17.1 17.1l2.1 2.1M4.8 19.2l2.1-2.1M17.1 6.9l2.1-2.1" />
            </svg>
            <span className={labelClasses(isParams)}>Paramètres</span>
          </Link>

          <Link href="/admin" className={linkClasses(isAdmin)} aria-label="Admin">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
            >
              <path d="M12 2l2.39 4.84 5.34.78-3.86 3.76.91 5.32L12 14.77 6.22 16.7l.91-5.32L3.27 7.62l5.34-.78L12 2z" />
            </svg>
            <span className={labelClasses(isAdmin)}>Admin</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
