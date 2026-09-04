"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import ThemeToggle from "@/components/ThemeToggle";

const MODE_KEY = "phatbot:preferred-mode";
type Mode = "athlete" | "coach";

export default function RoleModeSwitcher() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [dualRole, setDualRole] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const isAuth = pathname.startsWith("/auth");
  const currentMode: Mode = pathname.startsWith("/coach") ? "coach" : "athlete";
  const dashboardHref = currentMode === "coach" ? "/coach" : "/";

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (isAuth) { setSignedIn(false); setLoading(false); return; }
    let active = true;
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setSignedIn(false); setDualRole(false); setLoading(false); return; }
      setSignedIn(true);
      const [{ data: coach }, { data: athlete }] = await Promise.all([
        supabase.from("coach_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("athlete_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!active) return;
      const both = Boolean(coach && athlete);
      setDualRole(both);
      setLoading(false);
      if (both) {
        try { localStorage.setItem(MODE_KEY, currentMode); } catch {}
      }
    })();
    return () => { active = false; };
  }, [currentMode, isAuth]);

  function switchMode(mode: Mode) {
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    window.location.href = mode === "coach" ? "/coach" : "/";
  }

  if (loading || isAuth || !signedIn) return null;

  const athleteLinks = [
    { href: "/", label: "Dashboard" },
    { href: "/progress", label: "Progress" },
    { href: "/reports", label: "Reports" },
    { href: "/account", label: "Account" },
  ];
  const coachLinks = [
    { href: "/coach", label: "Coach Home" },
    { href: "/coach/invitations", label: "Invitations" },
  ];
  const links = currentMode === "coach" ? coachLinks : athleteLinks;

  return (
    <header className="phat-app-header sticky top-0 z-50 border-b border-zinc-800 bg-black/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-6">
        <Link href={dashboardHref} className="flex min-w-0 items-center gap-2 rounded-md" aria-label={`Return to ${currentMode} dashboard`}>
          <img src="/branding/PHATbot%20ICON.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
          <span className="min-w-0 whitespace-nowrap text-sm font-bold uppercase tracking-[.16em] text-white sm:text-base">PHATBOT</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label={`${currentMode} navigation`}>
          {links.map(link => <Link key={link.href} href={link.href} className={`rounded-md px-3 py-2 text-xs font-bold transition-colors ${pathname === link.href ? "text-white" : "text-zinc-400 hover:text-white"}`}>{link.label}</Link>)}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {dualRole && <div className="hidden rounded-lg border border-zinc-700 p-1 text-xs font-bold sm:flex">
            <button type="button" onClick={() => switchMode("athlete")} className={`whitespace-nowrap rounded-md px-3 py-2 transition-colors ${currentMode === "athlete" ? "phat-accent-bg" : "text-zinc-300 hover:text-white"}`}>Athlete View</button>
            <button type="button" onClick={() => switchMode("coach")} className={`whitespace-nowrap rounded-md px-3 py-2 transition-colors ${currentMode === "coach" ? "phat-accent-bg" : "text-zinc-300 hover:text-white"}`}>Coach View</button>
          </div>}
          <ThemeToggle />
          <button type="button" onClick={() => setMenuOpen(v => !v)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 text-xl text-white md:hidden" aria-label="Open navigation" aria-expanded={menuOpen}>☰</button>
        </div>
      </div>

      {menuOpen && <div className="border-t border-zinc-800 px-3 pb-3 pt-2 md:hidden">
        <nav className="mx-auto grid max-w-5xl gap-2" aria-label={`${currentMode} mobile navigation`}>
          {links.map(link => <Link key={link.href} href={link.href} className={`rounded-lg border px-4 py-3 text-sm font-bold ${pathname === link.href ? "border-[#ff0032] bg-[rgba(255,0,50,.08)] text-white" : "border-zinc-800 text-zinc-300"}`}>{link.label}</Link>)}
          {dualRole && <button type="button" onClick={() => switchMode(currentMode === "coach" ? "athlete" : "coach")} className="phat-accent-bg rounded-lg px-4 py-3 text-left text-sm font-bold">Switch to {currentMode === "coach" ? "Athlete" : "Coach"} View</button>}
        </nav>
      </div>}
    </header>
  );
}
