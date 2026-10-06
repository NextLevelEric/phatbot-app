"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const PENDING_GROUP_KEY = "phatbot:pending-group-code";

export default function GroupJoinPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const [state, setState] = useState<"checking" | "joining" | "joined" | "error">("checking");
  const [message, setMessage] = useState("PHATBOT is finding your group...");

  useEffect(() => {
    let active = true;
    void (async () => {
      const s = createSupabaseBrowserClient();
      const { data: { user } } = await s.auth.getUser();
      if (!active) return;
      if (!user) {
        try { localStorage.setItem(PENDING_GROUP_KEY, code); } catch {}
        window.location.href = `/auth?next=${encodeURIComponent(`/groups/join/${code}`)}`;
        return;
      }
      setState("joining");
      setMessage("Group found. Adding you to the crew...");
      const { data, error } = await s.rpc("join_athlete_group", { p_join_code: code });
      if (!active) return;
      if (error || !data) {
        setState("error");
        setMessage(error?.message || "PHATBOT could not join this group.");
        return;
      }
      try { localStorage.removeItem(PENDING_GROUP_KEY); } catch {}
      setState("joined");
      setMessage("You're in. Welcome to the crew.");
      window.setTimeout(() => window.location.assign(`/groups?group=${data}`), 900);
    })();
    return () => { active = false; };
  }, [code]);

  return <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
    <p className="text-xs font-black uppercase tracking-[.24em] text-[#ff0032]">PHATBOT GROUPS</p>
    <h1 className="mt-3 text-4xl font-black">Join the crew.</h1>
    {state === "joined"
      ? <div className="mt-7 grid h-20 w-20 place-items-center rounded-full border-2 border-[#ff0032] bg-[#ff0032]/10 text-4xl">✓</div>
      : <div className={`mt-7 h-16 w-16 rounded-full border-4 ${state === "error" ? "border-zinc-700" : "animate-pulse border-[#ff0032]"}`} />}
    <p className="mt-6 text-sm leading-6 text-zinc-400">{message}</p>
    <p className="mt-3 font-mono text-xs font-black tracking-[.18em] text-zinc-600">GROUP {code}</p>
    {state === "error" && <div className="mt-7 grid w-full gap-3">
      <button onClick={() => window.location.reload()} className="rounded-xl bg-[#ff0032] px-5 py-3 font-black text-white">TRY AGAIN</button>
      <button onClick={() => window.location.href = "/groups"} className="rounded-xl border border-zinc-700 px-5 py-3 font-bold">Back to Groups</button>
    </div>}
  </main>;
}
