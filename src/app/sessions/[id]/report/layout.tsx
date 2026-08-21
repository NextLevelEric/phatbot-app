"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import PlateauReportSignal from "./PlateauReportSignal";

export default function WorkoutReportLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();

  return (
    <>
      <PlateauReportSignal sessionId={params.id} />
      {children}
    </>
  );
}
