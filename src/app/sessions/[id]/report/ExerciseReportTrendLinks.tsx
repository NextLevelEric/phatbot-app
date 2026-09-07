"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type ExerciseRow = { exercise_id: string; exercise_name_snapshot: string };

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export default function ExerciseReportTrendLinks({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    async function wireExerciseCards() {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("exercise_sessions")
        .select("exercise_id, exercise_name_snapshot")
        .eq("workout_session_id", sessionId);

      if (cancelled || error || !data?.length) return;

      const byName = new Map(
        (data as ExerciseRow[]).map((row) => [normalize(row.exercise_name_snapshot), row.exercise_id]),
      );

      const articles = Array.from(document.querySelectorAll("main article"));
      for (const article of articles) {
        const heading = article.querySelector("h2");
        const name = heading?.textContent?.trim();
        if (!name) continue;
        const exerciseId = byName.get(normalize(name));
        if (!exerciseId) continue;

        article.setAttribute("role", "link");
        article.setAttribute("tabindex", "0");
        article.setAttribute("aria-label", `View ${name} exercise trend`);
        article.classList.add("cursor-pointer", "transition-colors", "hover:border-zinc-600", "active:border-[#ff0032]");

        const openTrend = () => router.push(`/progress/exercises?exercise=${encodeURIComponent(exerciseId)}`);
        const onClick = (event: Event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("a,button,input,select,textarea")) return;
          openTrend();
        };
        const onKeyDown = (event: Event) => {
          const keyboard = event as KeyboardEvent;
          if (keyboard.key !== "Enter" && keyboard.key !== " ") return;
          keyboard.preventDefault();
          openTrend();
        };

        article.addEventListener("click", onClick);
        article.addEventListener("keydown", onKeyDown);
        cleanups.push(() => {
          article.removeEventListener("click", onClick);
          article.removeEventListener("keydown", onKeyDown);
        });
      }
    }

    void wireExerciseCards();
    const timer = window.setTimeout(() => void wireExerciseCards(), 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [router, sessionId]);

  return null;
}
