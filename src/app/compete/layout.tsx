import type { ReactNode } from "react";
import NewAwardReveal from "@/components/NewAwardReveal";
import LeaderboardIdentitySettings from "@/components/LeaderboardIdentitySettings";

export default function CompeteLayout({children}:{children:ReactNode}){
  return <><NewAwardReveal/>{children}<div className="mx-auto max-w-2xl px-4 pb-28 sm:px-6"><LeaderboardIdentitySettings/></div></>;
}
