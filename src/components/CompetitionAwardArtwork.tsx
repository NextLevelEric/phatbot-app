import Image from "next/image";
import { getAwardArt } from "@/features/competition/awardArt";
import type { CompetitionPeriodRecord } from "@/features/competition/personalStatus";

type Props = {
  award: Pick<CompetitionPeriodRecord, "competition" | "cadence">;
  className?: string;
};

export default function CompetitionAwardArtwork({ award, className = "h-32 w-32" }: Props) {
  const artwork = getAwardArt(award);
  return <Image src={artwork.src} alt={artwork.alt} width={1400} height={1400} sizes="(max-width: 640px) 320px, 400px" className={`${className} object-contain ${award.cadence === "weekly" ? "drop-shadow-[0_0_28px_rgba(226,232,240,.35)]" : "drop-shadow-[0_0_28px_rgba(250,204,21,.28)]"}`} />;
}
