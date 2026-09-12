import Image from "next/image";
import { getCompetitionAwardArt } from "@/features/competition/awardArt";
import type { CompetitionKind } from "@/features/competition/personalStatus";

type Props = {
  competition: CompetitionKind;
  className?: string;
};

export default function CompetitionAwardArtwork({ competition, className = "h-32 w-32" }: Props) {
  const artwork = getCompetitionAwardArt(competition);
  return <Image src={artwork.src} alt={artwork.alt} width={1400} height={1400} sizes="(max-width: 640px) 320px, 400px" className={`${className} object-contain drop-shadow-[0_0_28px_rgba(250,204,21,.28)]`} />;
}
