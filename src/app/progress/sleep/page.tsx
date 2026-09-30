"use client";
import Link from 'next/link';
import { useEffect,useState } from 'react';
import SleepRecoveryDashboard from '@/components/SleepRecoveryDashboard';
import { loadRecoveryData } from '@/features/recovery/data';
import { createSupabaseBrowserClient } from '@/lib/supabase';
export default function SleepPage() {
  const [data,setData]=useState<Awaited<ReturnType<typeof loadRecoveryData>>|null>(null),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setFailed(false);setData(null);void(async()=>{try{const client=createSupabaseBrowserClient();const {data:{user},error}=await client.auth.getUser();if(!active)return;if(error)throw error;if(!user){window.location.href='/auth';return;}const result=await loadRecoveryData(client,user.id);if(active)setData(result);}catch{if(active)setFailed(true);}})();return()=>{active=false;};},[attempt]);
  return <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6"><Link href="/progress" className="min-h-11 py-2 text-sm font-bold text-zinc-400">← Progress</Link><header><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">PHATBOT Recovery</p><h1 className="mt-2 text-3xl font-black">Sleep &amp; Recovery</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Your sleep, the training that followed, and what your own history can tell you.</p></header>{failed?<section className="rounded-2xl border border-zinc-800 p-5"><p>Sleep &amp; Recovery is temporarily unavailable. Your saved history is safe.</p><button onClick={()=>setAttempt(value=>value+1)} className="mt-4 min-h-11 rounded-xl border border-zinc-700 px-4">Try again</button></section>:data?<SleepRecoveryDashboard {...data}/>:<p role="status">Loading sleep and training history…</p>}<Link href="/account" className="rounded-xl border border-zinc-700 p-4 text-center text-sm font-bold">Manage health connection / Sync Health Data</Link></main>;
}
