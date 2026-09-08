import type { ReactNode } from "react";
import CardioSegmentProgress from "@/components/CardioSegmentProgress";

export default function ActivityProgressLayout({children}:{children:ReactNode}){
  return <div className="flex flex-col"><CardioSegmentProgress/><div className="-mt-4">{children}</div></div>;
}
