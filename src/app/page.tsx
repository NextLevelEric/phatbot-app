"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Profile = {
  display_name: string | null;
};

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        setSignedIn(false);
        setLoading(false);
        return;
      }

      setSignedIn(true);
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();

      if (active) {
        setProfile(data);
        setLoading(false);
      }
    }

    loadUser();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12">
        <p className="text-zinc-300">Loading PHATBOT...</p>
      </main>
    );
  }

  if (!signedIn) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p>
          <h1 className="mt-2 text-4xl font-bold">Did you improve today?</h1>
          <p className="mt-4 text-zinc-300">PHATBOT tracks progressive overload, workout scoring, personal records, and your performance over time.</p>
        </div>
        <Link href="/auth" className="rounded-lg bg-white px-5 py-3 text-center font-semibold text-black">Create Account / Sign In</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT</p>
          <h1 className="mt-2 text-3xl font-bold">Welcome{profile?.display_name ? `, ${profile.display_name}` : ""}.</h1>
          <p className="mt-2 text-zinc-300">Your training dashboard is ready.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/account" className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Account</Link>
          <button onClick={signOut} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold">Sign Out</button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 p-5">
          <p className="text-sm text-zinc-400">Latest Workout</p>
          <p className="mt-2 text-2xl font-semibold">No workouts yet</p>
          <p className="mt-2 text-sm text-zinc-400">Your first completed workout will appear here.</p>
        </div>
        <div className="rounded-xl border border-zinc-800 p-5">
          <p className="text-sm text-zinc-400">Weekly Score</p>
          <p className="mt-2 text-2xl font-semibold">—</p>
          <p className="mt-2 text-sm text-zinc-400">PHATBOT will calculate this from completed workouts.</p>
        </div>
      </section>

      <Link href="/workouts" className="rounded-lg bg-white px-5 py-3 text-center font-semibold text-black">Start Workout</Link>
    </main>
  );
}
