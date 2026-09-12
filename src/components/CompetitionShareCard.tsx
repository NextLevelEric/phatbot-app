"use client";

import { useMemo, useState } from "react";
import { getCompetitionAwardArt } from "@/features/competition/awardArt";
import { buildCompetitionShareContent, canShareAthleteCompetition, type CompetitionShareMode } from "@/features/competition/share";
import type { CompetitionCadence, CompetitionKind } from "@/features/competition/personalStatus";
import { sharePngWithFallback } from "@/features/sharing/shareImage";

type Props = {
  competition: CompetitionKind;
  cadence: CompetitionCadence;
  winnerName: string;
  result: string;
  isMine?: boolean;
  mode?: CompetitionShareMode;
  rank?: number | null;
  finalized?: boolean;
  periodState?: "open" | "reconciling" | "finalized";
  tiedAtRank?: boolean;
  coWinner?: boolean | null;
  compact?: boolean;
  buttonLabel?: string;
};

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[char] ?? char));
}

function awardSvg(dataUrl: string) {
  return `<image x="260" y="235" width="560" height="500" href="${dataUrl}" preserveAspectRatio="xMidYMid meet"/>`;
}

async function loadAwardDataUrl(competition: CompetitionKind) {
  const response = await fetch(getCompetitionAwardArt(competition).src);
  if (!response.ok) throw new Error("Could not load award artwork");
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not encode award artwork"));
    reader.onerror = () => reject(reader.error ?? new Error("Could not encode award artwork"));
    reader.readAsDataURL(blob);
  });
}

export default function CompetitionShareCard({ competition, cadence, winnerName, result, isMine = false, mode = "award", rank = null, finalized = false, periodState, tiedAtRank = false, coWinner = null, compact = false, buttonLabel }: Props) {
  const [message, setMessage] = useState("");
  const shareRank = rank ?? (mode === "award" ? 1 : null);
  const allowed = canShareAthleteCompetition({ isMine, rank: shareRank });
  const content = useMemo(() => shareRank === null ? null : buildCompetitionShareContent({ competition, cadence, athleteName: winnerName, result, rank: shareRank, finalized, periodState, tiedAtRank, mode, coWinner }), [competition, cadence, winnerName, result, shareRank, finalized, periodState, tiedAtRank, mode, coWinner]);

  async function share() {
    if (!content) return;
    try {
      const awardDataUrl = await loadAwardDataUrl(competition);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#050505"/><text x="80" y="105" font-family="Arial Black,Arial" font-size="30" font-weight="900" letter-spacing="8" fill="#ff0032">PHATBOT COMPETE</text><text x="80" y="170" font-family="Arial,Helvetica" font-size="25" font-weight="700" letter-spacing="5" fill="#777">${escapeXml(content.heading)}</text>${awardSvg(awardDataUrl)}<text x="540" y="760" text-anchor="middle" font-family="Arial Black,Arial" font-size="58" font-weight="900" fill="#fff">${escapeXml(content.hero)}</text><text x="540" y="828" text-anchor="middle" font-family="Arial Black,Arial" font-size="30" font-weight="900" fill="#f7c623">${escapeXml(content.status)}</text><text x="540" y="930" text-anchor="middle" font-family="Arial Black,Arial" font-size="58" font-weight="900" fill="#fff">${escapeXml(content.result)}</text><text x="540" y="1015" text-anchor="middle" font-family="Arial,Helvetica" font-size="38" font-weight="800" fill="#f7c623">${escapeXml(content.athleteName)}</text><text x="540" y="1075" text-anchor="middle" font-family="Arial,Helvetica" font-size="25" font-weight="700" fill="#777">${escapeXml(content.note)}</text><text x="540" y="1184" text-anchor="middle" font-family="Arial Black,Arial" font-size="28" font-weight="900" fill="#fff">TRAIN. TRACK. IMPROVE. COMPETE.</text><text x="540" y="1242" text-anchor="middle" font-family="Arial,Helvetica" font-size="24" font-weight="700" fill="#777">Powered by PHATBOT</text></svg>`;
      const image = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      try {
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
        const canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1350;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No canvas context");
        context.drawImage(image, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not render share card")), "image/png", 1));
        const transport = await sharePngWithFallback(blob, { fileName: content.fileName, title: "PHATBOT Compete", text: content.shareText });
        setMessage(transport === "download" ? "Saved image" : "Shared");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") setMessage("Try again");
    }
  }

  if (!allowed || !content) return null;
  return <div className={`${compact ? "mt-3" : "mt-5"} flex flex-col items-center justify-center gap-2`}><button type="button" onClick={share} aria-label={buttonLabel ?? "Share my PHATBOT competition card"} title={buttonLabel ?? "Share my PHATBOT competition card"} className={`${buttonLabel ? "h-11 gap-2 px-5" : compact ? "h-9 w-9" : "h-11 w-11"} flex items-center justify-center rounded-full border border-yellow-500/40 bg-black/85 text-yellow-300 shadow-lg backdrop-blur hover:border-yellow-400 hover:text-white`}><svg viewBox="0 0 24 24" width={compact ? 16 : 19} height={compact ? 16 : 19} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.7 6.8-4"/><path d="m8.6 13.3 6.8 4"/></svg>{buttonLabel && <span className="text-xs font-black uppercase tracking-[.12em]">{buttonLabel}</span>}</button>{message && <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{message}</span>}</div>;
}
