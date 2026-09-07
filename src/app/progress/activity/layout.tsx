import type { ReactNode } from "react";
import CardioSegmentProgress from "@/components/CardioSegmentProgress";

export default function ActivityProgressLayout({children}:{children:ReactNode}){
  return <>{children}<CardioSegmentProgress/></>;
}
