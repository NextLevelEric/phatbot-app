"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import PlateauReportSignal from "./PlateauReportSignal";
import ReportShareActions from "./ReportShareActions";
import WorkoutReportPRShareActions from "@/components/WorkoutReportPRShareActions";

export default function WorkoutReportLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();

  return (
    <>
      <PlateauReportSignal sessionId={params.id} />
      {children}
      <ReportShareActions />
      <WorkoutReportPRShareActions sessionId={params.id} />
    </>
  );
}
