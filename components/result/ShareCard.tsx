"use client";

// 공유 카드: <canvas>에 직접 드로잉(외부 라이브러리 없음)한 결과 카드 PNG를 만든다.
// 서비스명 · 팀 코드/스코어 · 결과 · 최대 카운터팩추얼 델타 한 줄. "이미지 저장"(다운로드)
// + "링크 복사"(navigator.clipboard, 실패 시 textarea 폴백).

import { useEffect, useRef, useState } from "react";
import { teamById } from "@/lib/data/teams";
import type { CfResult } from "@/lib/engine/counterfactual";
import type { MatchState } from "@/lib/engine/match";
import type { ShootoutResult } from "@/lib/engine/shootout";
import { heroLine } from "./cf-labels";

interface ShareCardProps {
  match: MatchState;
  cf: CfResult;
  shootout?: ShootoutResult;
}

const W = 720;
const H = 900;

function resultWord(me: number, opp: number, shootout?: ShootoutResult): string {
  if (shootout) return shootout.winner === "me" ? "승부차기 승리" : "승부차기 패배";
  if (me > opp) return "승리";
  if (me === opp) return "무승부";
  return "패배";
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function ShareCard({ match, cf, shootout }: ShareCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const me = teamById(match.me.teamId);
  const opp = teamById(match.opp.teamId);
  const meCode = me?.code ?? "ME";
  const oppCode = opp?.code ?? "OPP";
  const word = resultWord(match.scoreMe, match.scoreOpp, shootout);
  const hero = heroLine(cf.deltas);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = 2;
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    const font = '"Segoe UI", Roboto, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

    // 배경 그라디언트(다크 피치)
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#141b18");
    bg.addColorStop(1, "#0b100e");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 상단 앰버 글로우
    const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.7);
    glow.addColorStop(0, "rgba(255,176,32,0.14)");
    glow.addColorStop(1, "rgba(255,176,32,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, 360);

    // 테두리
    ctx.strokeStyle = "rgba(228,255,240,0.1)";
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    // 서비스명
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffb020";
    ctx.font = `800 30px ${font}`;
    ctx.fillText("T O U C H L I N E", W / 2, 108);
    ctx.fillStyle = "#8c9a94";
    ctx.font = `600 18px ${font}`;
    ctx.fillText("당신이 감독이라면", W / 2, 140);

    // 팀 코드
    ctx.fillStyle = "#eef4f0";
    ctx.font = `900 44px ${font}`;
    ctx.textAlign = "left";
    ctx.fillText(meCode, 96, 320);
    ctx.textAlign = "right";
    ctx.fillText(oppCode, W - 96, 320);

    // 스코어
    ctx.textAlign = "center";
    ctx.font = `900 150px ${font}`;
    ctx.fillStyle = "#eef4f0";
    ctx.fillText(`${match.scoreMe}`, W / 2 - 96, 360);
    ctx.fillText(`${match.scoreOpp}`, W / 2 + 96, 360);
    ctx.fillStyle = "#8c9a94";
    ctx.font = `700 80px ${font}`;
    ctx.fillText(":", W / 2, 348);

    // 승부차기 스코어
    if (shootout) {
      const meK = shootout.rounds.filter((r) => r.side === "me" && r.scored).length;
      const oppK = shootout.rounds.filter((r) => r.side === "opp" && r.scored).length;
      ctx.fillStyle = "#8c9a94";
      ctx.font = `700 26px ${font}`;
      ctx.fillText(`승부차기 ${meK} : ${oppK}`, W / 2, 420);
    }

    // 결과 워드
    const wordColor = word.includes("승리") ? "#34e08a" : word.includes("무승부") ? "#8c9a94" : "#ff5470";
    ctx.fillStyle = wordColor;
    ctx.font = `900 56px ${font}`;
    ctx.fillText(word, W / 2, shootout ? 500 : 480);

    // 카운터팩추얼 한 줄 (박스 안 래핑)
    const boxY = 560;
    const boxH = 220;
    ctx.fillStyle = "rgba(22,48,32,0.6)";
    ctx.beginPath();
    ctx.roundRect(64, boxY, W - 128, boxH, 24);
    ctx.fill();
    ctx.strokeStyle = "rgba(228,255,240,0.1)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffb020";
    ctx.font = `700 16px ${font}`;
    ctx.fillText("이 경기의 결정적 순간", W / 2, boxY + 44);

    const heroColor = hero.tone === "gain" ? "#34e08a" : hero.tone === "danger" ? "#ff5470" : "#eef4f0";
    ctx.fillStyle = heroColor;
    ctx.font = `800 32px ${font}`;
    const lines = wrapText(ctx, hero.text, W - 200);
    lines.slice(0, 3).forEach((ln, i) => {
      ctx.fillText(ln, W / 2, boxY + 96 + i * 46);
    });

    // 푸터 디스클레이머
    ctx.fillStyle = "#8c9a94";
    ctx.font = `500 15px ${font}`;
    ctx.fillText("모든 능력치·결과는 가상 데이터입니다", W / 2, H - 56);
  }, [match, cf, shootout, meCode, oppCode, word, hero.text, hero.tone]);

  const saveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `touchline-${meCode}-${oppCode}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const copyLink = async () => {
    const url = typeof window !== "undefined" ? window.location.origin : "";
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setCopied(ok ? "링크가 복사됐어요!" : url);
    window.setTimeout(() => setCopied(null), 2400);
  };

  return (
    <section className="panel rounded-[10px] p-4">
      <p className="eyebrow text-accent">공유 카드</p>
      <div className="mt-3 overflow-hidden rounded-[10px] border border-line">
        <canvas
          ref={canvasRef}
          className="block w-full"
          style={{ aspectRatio: `${W} / ${H}` }}
          role="img"
          aria-label={`${meCode} ${match.scoreMe} 대 ${match.scoreOpp} ${oppCode}, ${word}. ${hero.text}`}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={saveImage}
          className="flex-1 rounded-full bg-accent py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5"
        >
          이미지 저장
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="flex-1 rounded-full border border-line py-3 text-sm font-bold text-ink transition-colors hover:border-white/25"
        >
          링크 복사
        </button>
      </div>
      {copied && (
        <p className="mt-2 text-center text-[12px] text-accent" role="status">
          {copied}
        </p>
      )}
    </section>
  );
}
