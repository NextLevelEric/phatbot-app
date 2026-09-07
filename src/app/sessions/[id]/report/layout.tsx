"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import PlateauReportSignal from "./PlateauReportSignal";
import ReportShareActions from "./ReportShareActions";
import WorkoutReportClarity from "./WorkoutReportClarity";
import WorkoutReportPRShareActions from "@/components/WorkoutReportPRShareActions";
import TrainTogetherReportCard from "@/components/TrainTogetherReportCard";

export default function WorkoutReportLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();

  return (
    <>
      <PlateauReportSignal sessionId={params.id} />
      {children}
      <WorkoutReportClarity />
      <TrainTogetherReportCard sessionId={params.id} />
      <ReportShareActions />
      <WorkoutReportPRShareActions sessionId={params.id} />
    </>
  );
}
