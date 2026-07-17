"use client";

// 승률 타임라인: 자체 SVG 라인차트. x=경기 시각(0~95분), y=우리 승률(0~100%).
// 단일 라인 1개(§4.6). 골 ⚽ · 개입 🧠 마커 + 현재 분 커서. 유리(초록)/불리(빨강)
// 색 규칙을 따르되 수치 라벨을 항상 병기한다(색만으로 정보 전달 금지).

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
    <div className="panel flex flex-col rounded-3xl p-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-accent">승률 타임라인</p>
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
            <text x={PAD_L - 5} y={yOf(v) + 3} textAnchor="end" fontSize="9" fill="var(--color-dim)">
              {v * 100}
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

        {/* 개입 🧠 마커 (세로 점선) */}
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
            <text x={xOf(iv.minute)} y={PAD_T - 3} textAnchor="middle" fontSize="11">
              🧠
            </text>
          </g>
        ))}

        {/* 골 ⚽ 마커 */}
        {goals.map((g, i) => (
          <text
            key={`goal-${i}-${g.minute}`}
            x={xOf(g.minute)}
            y={yOf(winAt(g.minute)) - 6}
            textAnchor="middle"
            fontSize="12"
          >
            ⚽
          </text>
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
