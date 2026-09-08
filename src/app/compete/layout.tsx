import type { ReactNode } from "react";
import NewAwardReveal from "@/components/NewAwardReveal";
import ChampionshipSunday from "@/components/ChampionshipSunday";
import MondayKickoff from "@/components/MondayKickoff";
import LeaderboardIdentitySettings from "@/components/LeaderboardIdentitySettings";
import CompetitionAutoRefresh from "@/components/CompetitionAutoRefresh";
import RecentClosedCompetitionResults from "@/components/RecentClosedCompetitionResults";

export default function CompeteLayout({children}:{children:ReactNode}){
  return <><NewAwardReveal/><MondayKickoff/><ChampionshipSunday/><CompetitionAutoRefresh/>{children}<RecentClosedCompetitionResults/><div className="mx-auto max-w-2xl px-4 pb-28 sm:px-6"><LeaderboardIdentitySettings/></div></>;
}
