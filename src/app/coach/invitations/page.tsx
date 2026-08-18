"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Invitation = { invitation_id: string; athlete_user_id: string; athlete_name: string; coach_email: string; created_at: string; expires_at: string };

export default function CoachInvitationsPage() {
  const [loading, setLoading] = useState(true); const [invitations, setInvitations] = useState<Invitation[]>([]); const [message, setMessage] = useState("");
  async function load() { const supabase = createSupabaseBrowserClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) { window.location.href = "/auth"; return; } const { data, error } = await supabase.rpc("my_pending_coach_invitations"); if (error) setMessage(error.message); else setInvitations((data ?? []) as Invitation[]); setLoading(false); }
  useEffect(() => { load(); }, []);
  async function respond(id: string, accept: boolean) { const supabase = createSupabaseBrowserClient(); setMessage(""); const { data, error } = await supabase.rpc("respond_to_coach_invitation", { invitation_id: id, accept_invitation: accept }); if (error || !data) { setMessage(error?.message ?? "Unable to respond to invitation."); return; } setMessage(accept ? "Athlete added to your coach dashboard." : "Invitation declined."); await load(); }
  if (loading) return <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">Loading invitations...</main>;
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-10"><header><p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">PHATBOT Coach</p><h1 className="mt-2 text-3xl font-bold">Athlete Invitations</h1><p className="mt-2 text-zinc-400">Athletes who entered the email address on your PHATBOT account appear here.</p></header>{message && <p className="rounded-xl border border-zinc-800 p-4 text-sm">{message}</p>}<section className="flex flex-col gap-3">{invitations.length === 0 ? <div className="rounded-xl border border-zinc-800 p-6"><h2 className="font-semibold">No pending invitations</h2><p className="mt-2 text-sm text-zinc-400">When an athlete adds your email, their request will appear here.</p></div> : invitations.map((invite) => <article key={invite.invitation_id} className="rounded-xl border border-zinc-800 p-5"><h2 className="text-lg font-semibold">{invite.athlete_name}</h2><p className="mt-1 text-sm text-zinc-500">Invited {new Date(invite.created_at).toLocaleDateString()}</p><div className="mt-4 grid gap-2 sm:grid-cols-2"><button onClick={() => respond(invite.invitation_id, true)} className="rounded-lg bg-white px-4 py-3 font-semibold text-black">Accept Athlete</button><button onClick={() => respond(invite.invitation_id, false)} className="rounded-lg border border-zinc-700 px-4 py-3 font-semibold">Decline</button></div></article>)}</section><Link href="/coach" className="rounded-lg border border-zinc-700 px-5 py-3 text-center font-semibold">Back to Coach Dashboard</Link></main>;
}
