"use client";

import { useMemo, useState } from "react";

type Competition = "beast" | "eager_beaver" | "cardio_bunny" | "step_king";
type Cadence = "daily" | "weekly";

type Props = {
  competition: Competition;
  cadence: Cadence;
  winnerName: string;
  result: string;
  isMine?: boolean;
};

const names: Record<Competition, string> = {
  beast: "BEAST",
  eager_beaver: "EAGER BEAVER",
  cardio_bunny: "CARDIO BUNNY",
  step_king: "STEP KING",
};

const hardware: Record<Competition, string> = {
  beast: "BEAST MEDALLION",
  eager_beaver: "GOLDEN LOG",
  cardio_bunny: "GOLDEN CARROT",
  step_king: "GOLDEN CROWN",
};

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  })[char] ?? char);
}

function awardSvg(competition: Competition) {
  if (competition === "beast") {
    return `<g transform="translate(540 485)"><circle r="162" fill="#f5b800"/><circle r="138" fill="#ffd95a" stroke="#8b5a00" stroke-width="12"/><circle r="112" fill="#f4bd28" stroke="#fff0a6" stroke-width="5"/><text y="-18" text-anchor="middle" font-family="Arial Black,Arial" font-size="42" font-weight="900" fill="#090909">BEAST</text><text y="34" text-anchor="middle" font-family="Arial Black,Arial" font-size="30" font-weight="900" fill="#090909">OF THE ${"${CADENCE}"}</text></g>`;
  }
  if (competition === "step_king") {
    return `<g transform="translate(540 455)" fill="#f6c928" stroke="#ffe88d" stroke-width="8"><path d="M-180 95 L-145 -125 L-45 5 L0 -165 L45 5 L145 -125 L180 95 Z"/><rect x="-172" y="95" width="344" height="70" rx="24"/><circle cx="0" cy="-164" r="18"/><circle cx="-145" cy="-125" r="16"/><circle cx="145" cy="-125" r="16"/></g>`;
  }
  if (competition === "cardio_bunny") {
    return `<g transform="translate(540 460)" stroke-linecap="round" stroke-linejoin="round"><path d="M0 -170 C85 -90 110 30 35 175 C15 215 -15 215 -35 175 C-110 30 -85 -90 0 -170 Z" fill="#f5bd22" stroke="#ffe98f" stroke-width="9"/><path d="M-10 -175 C-80 -245 -135 -245 -155 -202 C-98 -202 -55 -176 -22 -130" fill="#d9a710" stroke="#ffe98f" stroke-width="8"/><path d="M14 -175 C75 -246 135 -240 162 -196 C100 -200 55 -168 22 -127" fill="#efca39" stroke="#ffe98f" stroke-width="8"/></g>`;
  }
  return `<g transform="translate(540 470)"><rect x="-170" y="-54" width="340" height="108" rx="54" fill="#d99b13" stroke="#ffe47a" stroke-width="9"/><ellipse cx="-170" cy="0" rx="34" ry="54" fill="#f6c432" stroke="#ffe47a" stroke-width="8"/><ellipse cx="170" cy="0" rx="34" ry="54" fill="#f6c432" stroke="#ffe47a" stroke-width="8"/><rect x="-112" y="55" width="224" height="52" rx="18" fill="#f6c432"/><rect x="-152" y="106" width="304" height="32" rx="14" fill="#bc7d08"/></g>`;
}

export default function CompetitionShareCard({ competition, cadence, winnerName, result, isMine=false }: Props) {
  const [message, setMessage] = useState("");
  const svg = useMemo(() => {
    const period = cadence === "weekly" ? "WEEK" : "DAY";
    const art = awardSvg(competition).replace("${CADENCE}", period);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><defs><radialGradient id="glow"><stop offset="0" stop-color="#ff0032" stop-opacity=".28"/><stop offset="1" stop-color="#050505" stop-opacity="0"/></radialGradient><linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0a0"/><stop offset=".45" stop-color="#f7c623"/><stop offset="1" stop-color="#a76800"/></linearGradient></defs><rect width="1080" height="1350" fill="#050505"/><circle cx="540" cy="500" r="500" fill="url(#glow)"/><text x="80" y="105" font-family="Arial Black,Arial" font-size="30" font-weight="900" letter-spacing="8" fill="#ff0032">PHATBOT COMPETE</text><text x="80" y="170" font-family="Arial,Helvetica" font-size="25" font-weight="700" letter-spacing="5" fill="#777">${cadence === "weekly" ? "WEEKLY CHAMPION" : "DAILY CHAMPION"}</text>${art}<text x="540" y="760" text-anchor="middle" font-family="Arial Black,Arial" font-size="64" font-weight="900" fill="#fff">${names[competition]}</text><text x="540" y="828" text-anchor="middle" font-family="Arial Black,Arial" font-size="34" font-weight="900" fill="#f7c623">${hardware[competition]}</text><text x="540" y="965" text-anchor="middle" font-family="Arial Black,Arial" font-size="62" font-weight="900" fill="#fff">${escapeXml(winnerName)}</text><text x="540" y="1032" text-anchor="middle" font-family="Arial,Helvetica" font-size="36" font-weight="800" fill="#f7c623">${escapeXml(result)}</text><line x1="140" x2="940" y1="1110" y2="1110" stroke="#252525" stroke-width="3"/><text x="540" y="1184" text-anchor="middle" font-family="Arial Black,Arial" font-size="28" font-weight="900" fill="#fff">TRAIN. TRACK. IMPROVE. COMPETE.</text><text x="540" y="1242" text-anchor="middle" font-family="Arial,Helvetica" font-size="24" font-weight="700" fill="#777">Powered by PHATBOT</text></svg>`;
  }, [competition, cadence, winnerName, result]);

  async function pngBlob() {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
      const canvas = document.createElement("canvas");
      canvas.width = 1080; canvas.height = 1350;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(image, 0, 0);
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG generation failed")), "image/png", 1));
    } finally { URL.revokeObjectURL(url); }
  }

  async function share() {
    try {
      const blob = await pngBlob();
      const file = new File([blob], `phatbot-${competition}-${cadence}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `PHATBOT ${names[competition]}`, text: `${winnerName} won ${names[competition]}: ${result}`, files: [file] });
        setMessage("Transmission sent.");
        return;
      }
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = href; link.download = file.name; link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setMessage("Share card saved.");
    } catch (error) { if ((error as Error)?.name !== "AbortError") setMessage("PHATBOT could not create the share card."); }
  }

  return <section className="rounded-3xl border border-yellow-500/30 bg-zinc-950 p-5">
    <p className="text-xs font-black uppercase tracking-[.2em] text-yellow-500">{isMine ? "Show Off Your Hardware" : "Champion Card"}</p>
    <h3 className="mt-2 text-2xl font-black">Built for the group chat.</h3>
    <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-black"><div className="aspect-[4/5] w-full" dangerouslySetInnerHTML={{ __html: svg }} /></div>
    <button type="button" onClick={share} className="mt-4 w-full rounded-xl bg-[#ff0032] px-5 py-4 font-black text-white">{isMine ? "Share My Win" : "Share Winner Card"}</button>
    {message && <p className="mt-3 text-center text-xs font-bold text-zinc-500">{message}</p>}
  </section>;
}
