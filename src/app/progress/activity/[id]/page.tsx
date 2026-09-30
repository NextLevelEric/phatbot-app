"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import CardioActivityReport from '@/components/CardioActivityReport';
import { loadActivityReport, type ActivityReportData } from '@/features/cardio/activityReportData';
import { createSupabaseBrowserClient } from '@/lib/supabase';

export default function CompletedActivityPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ActivityReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setData(null); setFailed(false);
    void (async () => {
      try {
        const client = createSupabaseBrowserClient();
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error) throw error;
        if (!user) { window.location.href = '/auth'; return; }
        const result = await loadActivityReport(client, user.id, id);
        if (active) setData(result);
      } catch { if (active) setFailed(true); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [id, attempt]);
  if (loading) return <main className="mx-auto max-w-2xl px-5 py-10" role="status">Loading activity report…</main>;
  if (data) return <CardioActivityReport data={data} />;
  return <main className="mx-auto max-w-2xl px-5 py-10"><Link href="/progress/activity" className="inline-block min-h-11 py-2 text-sm font-bold text-zinc-400">← Activity &amp; Cardio</Link><h1 className="mt-5 text-2xl font-black">{failed ? 'Activity report could not load' : 'Activity not found'}</h1><p className="mt-3 text-sm text-zinc-400">{failed ? 'Your saved data is safe. Check your connection and try again.' : 'This activity is not available for your account. Choose an activity from your dashboard.'}</p>{failed && <button onClick={() => setAttempt(value=>value+1)} className="mt-5 min-h-11 rounded-xl border border-zinc-600 px-5 font-bold">Try again</button>}</main>;
}
