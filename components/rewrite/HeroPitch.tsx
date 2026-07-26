"use client";

// 히어로 방송 피치 보드 — "월드컵 경기를 지금 보고 있다"는 시각.
//
// 텍스트만 있던 히어로가 "PPT 슬라이드처럼 밋밋하다"는 피드백에 대한 답이다. 앱의
// 실제 그래픽 언어(플러드라이트 잔디 · 방송 스코어보드 · 실제 국기)로 월드컵 중계
// 오프닝의 분위기를 준다 — 가짜 스크린샷이 아니라 이 앱이 쓰는 바로 그 피치 그래픽.
// 정적 SVG라 성능 부담이 없고, 결정적 순간(결승, 63′) 하나를 방송 화면처럼 담는다.

import { teamById } from "@/lib/data/teams";
import { wc2026TeamId } from "@/lib/wc2026/data";
import { FlagBadge } from "@/components/ui/FlagBadge";

function teamOf(code: string) {
  const t = teamById(wc2026TeamId(code));
  return { color1: t?.color1 ?? "#666666", color2: t?.color2 ?? "#cccccc" };
}

// 우리(공세) 11 + 상대(수세) 5 + 공. 우리가 상대 골문을 향해 미는 한 장면.
const OURS = [
  [24, 150], [76, 54], [76, 116], [76, 184], [76, 246],
  [138, 116], [138, 150], [138, 184], [200, 80], [200, 220], [232, 150],
];
const OPPS = [[376, 150], [320, 60], [320, 116], [320, 184], [320, 240]];

export function HeroPitch() {
  const esp = teamOf("ESP");
  const arg = teamOf("ARG");

  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden rounded-panel border border-line shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, rgba(255,255,255,0.06), transparent 55%), linear-gradient(180deg, var(--color-turf), var(--color-turf-2))",
      }}
      role="img"
      aria-label="결승 결정적 순간, 스페인 대 아르헨티나 방송 화면"
    >
      {/* 모잉 스트라이프(잔디 이랑) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0 26px, rgba(0,0,0,0.05) 26px 52px)",
        }}
      />

      <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" aria-hidden>
        <g fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2">
          <rect x="8" y="8" width="384" height="284" rx="4" />
          <line x1="200" y1="8" x2="200" y2="292" />
          <circle cx="200" cy="150" r="42" />
          <rect x="8" y="95" width="52" height="110" />
          <rect x="340" y="95" width="52" height="110" />
        </g>
        {OURS.map(([x, y], i) => (
          <circle key={`o-${i}`} cx={x} cy={y} r="8" fill="var(--color-accent)" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
        ))}
        {OPPS.map(([x, y], i) => (
          <circle key={`p-${i}`} cx={x} cy={y} r="8" fill="var(--color-danger)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        ))}
        <circle cx="246" cy="150" r="4" fill="#ffffff" />
      </svg>

      {/* 방송 태그(좌상단) */}
      <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-line-strong bg-pitch/75 px-3 py-1.5 text-[12px] font-bold text-ink backdrop-blur-sm">
        <span className="size-2 shrink-0 rounded-full bg-danger" aria-hidden />
        결승 · 결정적 순간 63′
      </div>

      {/* 방송 스코어보드(우하단) */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2.5 rounded-panel border border-line-strong bg-pitch/85 px-3 py-2 backdrop-blur-sm">
        <FlagBadge code="ESP" color1={esp.color1} color2={esp.color2} size={20} />
        <span className="text-[13px] font-black text-dim">ESP</span>
        <span className="stat-num text-xl leading-none text-ink">
          0<span className="px-1 text-dim">:</span>1
        </span>
        <span className="text-[13px] font-black text-dim">ARG</span>
        <FlagBadge code="ARG" color1={arg.color1} color2={arg.color2} size={20} />
      </div>
    </div>
  );
}
