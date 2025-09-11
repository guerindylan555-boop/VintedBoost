"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { isAdminEmail } from "@/lib/admin";

type ThemeMode = "system" | "light" | "dark";
type ImageProvider = "google" | "openrouter";

function applyTheme(mode: ThemeMode) {
  try {
    const root = document.documentElement;
    if (mode === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) root.classList.add("dark");
      else root.classList.remove("dark");
      localStorage.setItem("theme", "system");
    } else if (mode === "dark") {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  } catch {}
}

export default function SettingsPage() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const [mode, setMode] = useState<ThemeMode>("system");
  const [savingTheme, setSavingTheme] = useState(false);

  const [provider, setProvider] = useState<ImageProvider>("google");
  const [savingProvider, setSavingProvider] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("theme") as ThemeMode | null;
      if (!stored) setMode("system");
      else if (stored === "dark" || stored === "light" || stored === "system") setMode(stored);
      else setMode("system");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("imageProvider") as ImageProvider | null;
      if (stored === "google" || stored === "openrouter") setProvider(stored);
    } catch {}
  }, []);

  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
  }, [user?.name, user?.email]);

  async function saveTheme(next: ThemeMode) {
    setSavingTheme(true);
    try {
      setMode(next);
      applyTheme(next);
    } finally {
      setSavingTheme(false);
    }
  }

  async function saveProvider(next: ImageProvider) {
    setSavingProvider(true);
    try {
      setProvider(next);
      try {
        localStorage.setItem("imageProvider", next);
      } catch {}
    } finally {
      setSavingProvider(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    setProfileMsg(null);
    setProfileErr(null);
    try {
      if (name.trim() && name.trim() !== (user?.name || "")) {
        await authClient.updateUser({ name: name.trim() });
      }
      if (email.trim() && email.trim() !== (user?.email || "")) {
        // changeEmail may send a verification depending on server config
        await authClient.changeEmail({ newEmail: email.trim() });
      }
      try { await authClient.getSession(); } catch {}
      setProfileMsg("Profil mis à jour.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Échec de la mise à jour";
      setProfileErr(msg);
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword() {
    setSavingPwd(true);
    setPwdMsg(null);
    setPwdErr(null);
    try {
      if (!currentPwd || !newPwd) {
        setPwdErr("Veuillez remplir tous les champs.");
        setSavingPwd(false);
        return;
      }
      if (newPwd.length < 8) {
        setPwdErr("Le nouveau mot de passe doit contenir au moins 8 caractères.");
        setSavingPwd(false);
        return;
      }
      if (newPwd !== confirmPwd) {
        setPwdErr("La confirmation ne correspond pas au nouveau mot de passe.");
        setSavingPwd(false);
        return;
      }
      await authClient.changePassword({ currentPassword: currentPwd, newPassword: newPwd });
      setPwdMsg("Mot de passe mis à jour.");
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Échec de la mise à jour du mot de passe";
      setPwdErr(msg);
    } finally {
      setSavingPwd(false);
    }
  }

  const admin = isAdminEmail(user?.email);

  return (
    <div className="mx-auto max-w-screen-md p-4">
      <h1 className="text-xl font-semibold uppercase tracking-widest mb-4">Paramètres {admin ? <span className="ml-2 align-middle rounded-md border border-brand-600 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-400">Admin</span> : null}</h1>

      <section className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Thème</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["system", "light", "dark"] as ThemeMode[]).map((m) => (
            <label key={m} className={`flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer ${mode===m?"border-brand-600 bg-brand-50/60 dark:bg-brand-900/10":"border-gray-200 dark:border-gray-700"}`}>
              <input
                type="radio"
                name="theme"
                value={m}
                checked={mode === m}
                onChange={() => saveTheme(m)}
                disabled={savingTheme}
              />
              {m === "system" ? "Système" : m === "light" ? "Clair" : "Sombre"}
            </label>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Génération d&apos;images</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["google", "openrouter"] as ImageProvider[]).map((p) => (
            <label
              key={p}
              className={`flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer ${
                provider === p
                  ? "border-brand-600 bg-brand-50/60 dark:bg-brand-900/10"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              <input
                type="radio"
                name="image-provider"
                value={p}
                checked={provider === p}
                onChange={() => saveProvider(p)}
                disabled={savingProvider}
              />
              {p === "google" ? "Google AI" : "OpenRouter"}
            </label>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Compte</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Nom</label>
            <input value={name} onChange={(e)=>setName(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Email</label>
            <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm" />
          </div>
        </div>
        {profileErr ? <div className="mt-2 text-sm text-red-600 dark:text-red-400">{profileErr}</div> : null}
        {profileMsg ? <div className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{profileMsg}</div> : null}
        <div className="mt-3 flex items-center justify-end">
          <button onClick={saveProfile} disabled={savingProfile} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{savingProfile?"Enregistrement…":"Enregistrer"}</button>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4">
        <h2 className="text-base font-semibold mb-3 uppercase tracking-wide">Mot de passe</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Ancien</label>
            <input type="password" value={currentPwd} onChange={(e)=>setCurrentPwd(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Nouveau</label>
            <input type="password" value={newPwd} onChange={(e)=>setNewPwd(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300">Confirmer</label>
            <input type="password" value={confirmPwd} onChange={(e)=>setConfirmPwd(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm" />
          </div>
        </div>
        {pwdErr ? <div className="mt-2 text-sm text-red-600 dark:text-red-400">{pwdErr}</div> : null}
        {pwdMsg ? <div className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{pwdMsg}</div> : null}
        <div className="mt-3 flex items-center justify-end">
          <button onClick={savePassword} disabled={savingPwd} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">{savingPwd?"Enregistrement…":"Mettre à jour"}</button>
        </div>
      </section>

      <div className="flex items-center justify-end">
        <button
          onClick={() => authClient.signOut().then(()=>location.assign('/auth'))}
          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
