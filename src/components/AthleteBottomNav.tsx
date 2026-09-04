"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type NavItem = {
  href: string;
  label: string;
  icon: "home" | "progress" | "compete" | "me";
  isActive: (pathname: string) => boolean;
};

const HIDDEN_PREFIXES = ["/auth", "/coach", "/admin", "/api", "/privacy", "/terms", "/support"];

const items: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: "home",
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/progress",
    label: "Progress",
    icon: "progress",
    isActive: (pathname) => pathname.startsWith("/progress") || pathname.startsWith("/reports") || pathname.startsWith("/weekly"),
  },
  {
    href: "/compete",
    label: "Compete",
    icon: "compete",
    isActive: (pathname) => pathname.startsWith("/compete"),
  },
  {
    href: "/account",
    label: "Me",
    icon: "me",
    isActive: (pathname) => pathname === "/account" || (pathname.startsWith("/account/") && !pathname.startsWith("/account/delete")),
  },
];

function shouldHide(pathname: string) {
  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  if (pathname.startsWith("/account/delete")) return true;
  return false;
}

function NavIcon({ icon, active }: { icon: NavItem["icon"]; active: boolean }) {
  const stroke = active ? "#ff0032" : "currentColor";

  if (icon === "progress") {
    return (
      <svg aria-hidden="true" viewBox="0 0 32 28" className="h-6 w-7" fill="none">
        <rect x="2" y="18" width="7" height="8" rx="1" fill="currentColor" />
        <rect x="12.5" y="11" width="7" height="15" rx="1" fill="currentColor" />
        <rect x="23" y="3" width="7" height="23" rx="1" fill="#ff0032" />
      </svg>
    );
  }

  if (icon === "compete") {
    return (
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-6 w-6" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5h14v5c0 6-3.1 10-7 10s-7-4-7-10V5Z" />
        <path d="M9 7H5v3c0 4 2.4 6.5 6 7.2M23 7h4v3c0 4-2.4 6.5-6 7.2" />
        <path d="M16 20v5M11 28h10M13 25h6" />
      </svg>
    );
  }

  if (icon === "home") {
    return (
      <svg aria-hidden="true" viewBox="0 0 32 32" className="h-6 w-6" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 14.5 16 5l11 9.5V27h-8v-8h-6v8H5V14.5Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-6 w-6" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round">
      <circle cx="16" cy="10" r="5" />
      <path d="M6 28c.7-6.3 4.2-10 10-10s9.3 3.7 10 10" />
    </svg>
  );
}

function DumbbellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 44 28" className="h-7 w-11" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <path d="M14 14h16M10 7v14M34 7v14M6 10v8M38 10v8" />
    </svg>
  );
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

  const renderItem = (item: NavItem) => {
    const active = item.isActive(pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-14 flex-col items-center justify-center px-1 py-1.5 text-[11px] font-semibold transition active:scale-95 ${active ? "text-white" : "text-zinc-300"}`}
      >
        <NavIcon icon={item.icon} active={active} />
        <span className={`mt-1 ${active ? "text-[#ff0032]" : ""}`}>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <div aria-hidden="true" className="h-[calc(5.9rem+env(safe-area-inset-bottom))] sm:hidden" />
      <nav
        aria-label="PHATBOT athlete navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800 bg-black/95 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur sm:hidden"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 items-end gap-1">
          {items.slice(0, 2).map(renderItem)}

          <Link
            href={trainHref}
            aria-current={trainActive ? "page" : undefined}
            aria-label={activeWorkoutId ? "Resume active workout" : "PHATBOT Train"}
            className={`-mt-4 flex min-h-[4.8rem] flex-col items-center justify-center px-1 text-center font-black transition active:scale-95 ${trainActive ? "text-white" : "text-[#ff0032]"}`}
          >
            <DumbbellIcon />
            <span className="mt-1 text-[10px] uppercase tracking-[.08em]">PHATBOT</span>
            <span className="text-xs">{activeWorkoutId ? "Resume" : "Train"}</span>
          </Link>

          {items.slice(2).map(renderItem)}
        </div>
      </nav>
    </>
  );
}
