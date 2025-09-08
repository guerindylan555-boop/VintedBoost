"use client";

import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";

export default function ThemeToggle() {
  const [enabled, setEnabled] = useState(false);

  // Initialize from localStorage or system preference
  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme");
      const preferDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = stored ? stored === "dark" : preferDark;
      setEnabled(isDark);
    } catch {}
  }, []);

  // Apply class to <html> and persist
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (enabled) {
        root.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        root.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
    } catch {}
  }, [enabled]);

  return (
    <div className="flex items-center gap-2">
      {enabled ? (
        // Moon icon when dark enabled
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-brand-600 dark:text-brand-300"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Sun icon when light
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-brand-600"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93 6.34 6.34M17.66 17.66 19.07 19.07M4.93 19.07 6.34 17.66M17.66 6.34 19.07 4.93" />
        </svg>
      )}
      <Toggle checked={enabled} onChange={setEnabled} ariaLabel="Basculer le thème sombre" />
    </div>
  );
}
