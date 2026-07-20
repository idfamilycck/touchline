"use client";

// 승률 타임라인: 자체 SVG 라인차트. x=경기 시각(0~95분), y=우리 승률(0~100%).
// 단일 라인 1개(§4.6). 골 SoccerBall · 개입 Brain 마커 + 현재 분 커서. 유리(초록)/불리(빨강)
// 색 규칙을 따르되 수치 라벨을 항상 병기한다(색만으로 정보 전달 금지).
//
// 마커는 Phosphor 아이콘 컴포넌트를 SVG 안에 그대로 중첩한다 — Phosphor 아이콘은
// 자신도 <svg viewBox="0 0 256 256">인 컴포넌트이고, SVG는 <svg> 안에 <svg>를 중첩하는
// 것이 표준(중첩 svg는 새 뷰포트를 연다)이라 x/y/size prop만으로 부모 좌표계에 배치할
// 수 있다(IconBase가 나머지 prop을 그대로 루트 svg 엘리먼트에 스프레드한다).

import { SoccerBall, Brain } from "@phosphor-icons/react";
import type { MatchEvent, Intervention } from "@/lib/engine/match";

const W = 320;
const H = 150;
const PAD_L = 30;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 22;
const MAX_MIN = 95;

interface ProbTimelineProps {
  timeline: Array<{ minute: number; win: number }>;
  events: MatchEvent[];
  interventions: Intervention[];
}

function xOf(minute: number): number {
  return PAD_L + (Math.min(minute, MAX_MIN) / MAX_MIN) * (W - PAD_L - PAD_R);
}
function yOf(win01: number): number {
  const clamped = Math.max(0, Math.min(1, win01));
  return PAD_T + (1 - clamped) * (H - PAD_T - PAD_B);
}

export function ProbTimeline({ timeline, events, interventions }: ProbTimelineProps) {
  const pts = timeline.length > 0 ? timeline : [{ minute: 0, win: 0.5 }];
  const last = pts[pts.length - 1];
  const favored = last.win >= 0.5;
  const lineColor = favored ? "var(--color-gain)" : "var(--color-danger)";
  const winPct = Math.round(last.win * 100);

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.minute).toFixed(1)} ${yOf(p.win).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${xOf(last.minute).toFixed(1)} ${yOf(0)} L ${xOf(pts[0].minute).toFixed(1)} ${yOf(0)} Z`;

  const winAt = (minute: number): number => {
    // 해당 분의 타임라인 값을 찾고, 없으면 가장 가까운 이전 값을 쓴다.
    let val = 0.5;
    for (const p of pts) {
      if (p.minute <= minute) val = p.win;
      else break;
    }
    return val;
  };

  const goals = events.filter((e) => e.type === "goal");
  const y50 = yOf(0.5);

  return (
    <div className="panel flex flex-col rounded-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow text-accent">승률 타임라인</p>
          <p className="mt-0.5 text-[10px] text-dim">
            세로축 우리 승리 확률(%) · 가로축 경기 시간(분)
          </p>
        </div>
        <span
          className="stat-num rounded-full px-2.5 py-0.5 text-xs font-bold"
          style={{
            color: lineColor,
            background: favored ? "rgba(59,227,138,0.14)" : "rgba(255,92,122,0.14)",
          }}
        >
          {favored ? "▲" : "▼"} {winPct}%
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label={`현재 우리 승률 ${winPct}퍼센트. ${favored ? "우리가 유리" : "상대가 유리"}합니다.`}
      >
        {/* y축 격자 + 라벨 (0/50/100%) */}
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              x1={PAD_L}
              y1={yOf(v)}
              x2={W - PAD_R}
              y2={yOf(v)}
              stroke="var(--color-line)"
              strokeWidth={v === 0.5 ? 0.8 : 0.5}
              strokeDasharray={v === 0.5 ? "3 3" : undefined}
            />
            {/* 단위(%)를 붙인다. 숫자만 있으면 "이게 뭘 재는 축인지" 알 수 없다는 지적이 있었다. */}
            <text x={PAD_L - 5} y={yOf(v) + 3} textAnchor="end" fontSize="9" fill="var(--color-dim)">
              {v * 100}%
            </text>
          </g>
        ))}
        {/* x축 분 라벨 */}
        {[0, 45, 90].map((m) => (
          <text
            key={m}
            x={xOf(m)}
            y={H - 6}
            textAnchor="middle"
            fontSize="9"
            fill="var(--color-dim)"
          >
            {m}′
          </text>
        ))}

        {/* 면적 + 라인 */}
        <path d={areaPath} fill={lineColor} opacity={0.1} />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* 개입 마커 (세로 점선 + Brain 아이콘) */}
        {interventions.map((iv, i) => (
          <g key={`iv-${i}-${iv.minute}`}>
            <line
              x1={xOf(iv.minute)}
              y1={PAD_T}
              x2={xOf(iv.minute)}
              y2={H - PAD_B}
              stroke="var(--color-accent)"
              strokeWidth={0.8}
              strokeDasharray="2 2"
              opacity={0.6}
            />
            <Brain
              x={xOf(iv.minute) - 5.5}
              y={PAD_T - 14}
              size={11}
              weight="bold"
              color="var(--color-accent)"
            />
          </g>
        ))}

        {/* 골 마커(SoccerBall 아이콘) */}
        {goals.map((g, i) => (
          <SoccerBall
            key={`goal-${i}-${g.minute}`}
            x={xOf(g.minute) - 6}
            y={yOf(winAt(g.minute)) - 18}
            size={12}
            weight="bold"
            color="var(--color-ink)"
          />
        ))}

        {/* 현재 분 커서 */}
        <line
          x1={xOf(last.minute)}
          y1={PAD_T}
          x2={xOf(last.minute)}
          y2={H - PAD_B}
          stroke={lineColor}
          strokeWidth={1}
          opacity={0.5}
        />
        <circle cx={xOf(last.minute)} cy={yOf(last.win)} r={3.5} fill={lineColor} stroke="var(--color-pitch)" strokeWidth={1.5} />

        {/* 50% 기준선 라벨 */}
        <text x={W - PAD_R} y={y50 - 3} textAnchor="end" fontSize="8" fill="var(--color-dim)" opacity={0.7}>
          균형
        </text>
      </svg>
    </div>
  );
}
