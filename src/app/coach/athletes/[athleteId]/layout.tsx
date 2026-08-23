"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function CoachAthleteLayout({children}:{children:ReactNode}){
  const {athleteId}=useParams<{athleteId:string}>();
  const pathname=usePathname();
  const reportsHref=`/coach/athletes/${athleteId}/reports`;
  const onReports=pathname===reportsHref;

  return <>
    {children}
    {!onReports&&<Link href={reportsHref} className="fixed bottom-5 right-5 z-40 rounded-full border border-[#ff0032]/60 bg-black px-5 py-3 text-sm font-black uppercase tracking-wider text-white shadow-2xl transition hover:bg-[#ff0032]">Reports</Link>}
  </>;
}
