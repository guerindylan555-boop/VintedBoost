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
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Espace réservé aux administrateurs. (Fonctionnalités à venir)
      </p>
      <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Connecté en tant que <span className="font-medium">{user.email}</span>
        </div>
      </div>
    </div>
  );
}
