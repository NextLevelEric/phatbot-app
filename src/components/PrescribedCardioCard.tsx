"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type Prescription = {
  id: string;
  activity_kind: "run" | "walk" | "bike";
  weekday: number;
  title: string;
  minimum_distance_meters: number | null;
  minimum_duration_seconds: number | null;
  optional_extra: boolean;
  notes: string | null;
  starts_on: string;
  ends_on: string | null;
};
type Activity = { activity_name: string | null; distance_meters: number | null; duration_seconds: number | null; started_at: string };

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function distanceLabel(meters: number | null) {
  if (!meters) return null;
  if (Math.abs(meters - 1609.344) < 2) return "1 mile";
  if (Math.abs(meters - 5000) < 2) return "5K";
  return `${(meters / 1609.344).toFixed(1)} mi`;
}
function activityMatches(kind: Prescription["activity_kind"], name: string | null) {
  const value = (name ?? "").toLowerCase();
  if (kind === "run") return value.includes("run");
  if (kind === "walk") return value.includes("walk") || value.includes("hike");
  return value.includes("cycl") || value.includes("bike");
}

export default function PrescribedCardioCard({ userId }: { userId: string }) {
  const [prescriptions,setPrescriptions]=useState<Prescription[]>([]);
  const [activities,setActivities]=useState<Activity[]>([]);
  const [loading,setLoading]=useState(true);
  const today=useMemo(()=>new Date(),[]);
  const dateKey=localDateKey(today);

  useEffect(()=>{
    let mounted=true;
    const supabase=createSupabaseBrowserClient();
    const start=new Date(today); start.setHours(0,0,0,0);
    const end=new Date(start); end.setDate(end.getDate()+1);
    void Promise.all([
      supabase.from("athlete_cardio_prescriptions").select("id,activity_kind,weekday,title,minimum_distance_meters,minimum_duration_seconds,optional_extra,notes,starts_on,ends_on").eq("athlete_user_id",userId).eq("is_active",true).eq("weekday",today.getDay()),
      supabase.from("cardio_activities").select("activity_name,distance_meters,duration_seconds,started_at").eq("athlete_user_id",userId).gte("started_at",start.toISOString()).lt("started_at",end.toISOString()).order("started_at",{ascending:false}),
    ]).then(([p,a])=>{
      if(!mounted)return;
      setPrescriptions(p.error?[]:(p.data??[]) as Prescription[]);
      setActivities(a.error?[]:(a.data??[]) as Activity[]);
      setLoading(false);
    });
    return()=>{mounted=false;};
  },[today,userId]);

  if(loading)return null;
  const todays=prescriptions.filter(p=>p.starts_on<=dateKey && (!p.ends_on || p.ends_on>=dateKey));
  if(!todays.length)return null;

  return <section className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black p-5 shadow-xl sm:p-6">
    <p className="text-xs font-black uppercase tracking-[.2em] text-[#ff0032]">Today · Prescribed cardio</p>
    <div className="mt-4 space-y-4">{todays.map(p=>{
      const matches=activities.filter(a=>activityMatches(p.activity_kind,a.activity_name));
      const best=matches.sort((a,b)=>(b.distance_meters??0)-(a.distance_meters??0))[0]??null;
      const distanceMet=!p.minimum_distance_meters || (best?.distance_meters??0)>=p.minimum_distance_meters;
      const durationMet=!p.minimum_duration_seconds || (best?.duration_seconds??0)>=p.minimum_duration_seconds;
      const complete=Boolean(best && distanceMet && durationMet);
      return <div key={p.id}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-2xl font-black">{p.title}</h2>
            <p className="mt-2 text-sm text-zinc-300">
              {p.minimum_distance_meters ? `${distanceLabel(p.minimum_distance_meters)} minimum` : ""}
              {p.minimum_distance_meters && p.minimum_duration_seconds ? " · " : ""}
              {p.minimum_duration_seconds ? `${Math.round(p.minimum_duration_seconds/60)} min minimum` : ""}
              {p.optional_extra ? " · More if you're feeling good" : ""}
            </p>
            {p.notes && <p className="mt-2 text-sm text-zinc-500">{p.notes}</p>}
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${complete?"bg-emerald-500/15 text-emerald-300":"bg-zinc-800 text-zinc-300"}`}>{complete?"Complete":"On deck"}</span>
        </div>
        {best && <p className="mt-4 rounded-2xl border border-zinc-800 bg-black/40 p-3 text-sm text-zinc-300">
          Apple Health: {best.distance_meters ? `${(best.distance_meters/1609.344).toFixed(2)} mi` : "distance unavailable"}{best.duration_seconds ? ` · ${Math.round(best.duration_seconds/60)} min` : ""}
          {!complete && " · Keep going to hit today's minimum."}
        </p>}
        {!best && <p className="mt-4 text-xs text-zinc-500">Your run will be recognized from your synced health workout. This does not change your strength-program position.</p>}
      </div>;
    })}</div>
  </section>;
}
