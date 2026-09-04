import type { ReactNode } from "react";
import NewAwardReveal from "@/components/NewAwardReveal";

export default function CompeteLayout({children}:{children:ReactNode}){
  return <><NewAwardReveal/>{children}</>;
}
