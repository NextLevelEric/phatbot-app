"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type NavItem = {
  href: string;
  label: string;
  glyph: string;
  isActive: (pathname: string) => boolean;
};

const HIDDEN_PREFIXES = ["/auth", "/coach", "/admin", "/api", "/privacy", "/terms", "/support"];

const items: NavItem[] = [
  {
    href: "/",
    label: "Home",
    glyph: "⌂",
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/progress",
    label: "Progress",
    glyph: "↗",
    isActive: (pathname) => pathname.startsWith("/progress") || pathname.startsWith("/reports") || pathname.startsWith("/weekly"),
  },
  {
    href: "/compete",
    label: "Compete",
    glyph: "★",
    isActive: (pathname) => pathname.startsWith("/compete"),
  },
  {
    href: "/account",
    label: "Me",
    glyph: "●",
    isActive: (pathname) => pathname === "/account" || (pathname.startsWith("/account/") && !pathname.startsWith("/account/delete")),
  },
];

function shouldHide(pathname: string) {
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (pathname.startsWith("/account/delete")) return true;
  return false;
}

export default function AthleteBottomNav() {
  const pathname = usePathname();
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);

  useEffect(() => {
    if (shouldHide(pathname)) return;

    let mounted = true;
    const supabase = createSupabaseBrowserClient();

    async function resolveActiveWorkout() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted || !session?.user) {
        if (mounted) setActiveWorkoutId(null);
        return;
      }

      const { data, error } = await supabase
        .from("workout_sessions")
        .select("id")
        .eq("athlete_user_id", session.user.id)
        .eq("status", "in_progress")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!mounted) return;
      if (error) {
        console.warn("PHATBOT navigation could not resolve active workout", error);
        setActiveWorkoutId(null);
        return;
      }
      setActiveWorkoutId(data?.id ?? null);
    }

    void resolveActiveWorkout();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void resolveActiveWorkout();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [pathname]);

  const trainHref = useMemo(
    () => activeWorkoutId ? `/sessions/${activeWorkoutId}` : "/workouts",
    [activeWorkoutId],
  );

  if (shouldHide(pathname)) return null;

  const trainActive = pathname.startsWith("/sessions/") || pathname.startsWith("/workouts");

  return (
    <>
      <div aria-hidden="true" className="h-[calc(5.75rem+env(safe-area-inset-bottom))] sm:hidden" />
      <nav
        aria-label="PHATBOT athlete navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800 bg-black/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:hidden"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 items-end gap-1">
          {items.slice(0, 2).map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-1 py-2 text-[11px] font-bold transition ${active ? "bg-zinc-900 text-white ring-1 ring-zinc-700" : "text-zinc-400 active:bg-zinc-900"}`}
              >
                <span aria-hidden="true" className="text-lg leading-none">{item.glyph}</span>
                <span className="mt-1">{item.label}</span>
              </Link>
            );
          })}

          <Link
            href={trainHref}
            aria-current={trainActive ? "page" : undefined}
            aria-label={activeWorkoutId ? "Resume active workout" : "Start a workout"}
            className={`-mt-7 flex min-h-[4.5rem] flex-col items-center justify-center rounded-full border-4 border-black px-2 text-center shadow-xl transition active:scale-95 ${trainActive ? "bg-white text-black ring-2 ring-[#ff0032]" : "bg-[#ff0032] text-white"}`}
          >
            <span aria-hidden="true" className="text-xl leading-none">▲</span>
            <span className="mt-1 text-[10px] font-black uppercase tracking-[.1em]">PHATBOT</span>
            <span className="text-xs font-black">{activeWorkoutId ? "Resume" : "Train"}</span>
          </Link>

          {items.slice(2).map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-1 py-2 text-[11px] font-bold transition ${active ? "bg-zinc-900 text-white ring-1 ring-zinc-700" : "text-zinc-400 active:bg-zinc-900"}`}
              >
                <span aria-hidden="true" className="text-lg leading-none">{item.glyph}</span>
                <span className="mt-1">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
