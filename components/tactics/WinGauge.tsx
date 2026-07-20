"use client";

// 정보 3계층의 1층: 항상 보이는 대형 승률 지표.
// - 반원 SVG 게이지 + 대형 승률 숫자(카운트업)
// - 직전 값 대비 델타 칩(+2.4%p 초록↑ / 빨강↓) — 수치를 항상 병기(색만으로 정보 전달 금지)
// - 승/무/패 3분할 바
// - 라인별 전력 3쌍 대결 막대(수비/중원/공격, 우리 vs 상대)

import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useSpring } from "framer-motion";
import type { LineStrengths } from "@/lib/engine/strength";

interface WinGaugeProps {
  /** winProbability() 결과. 매치업 미구성 시 undefined */
  wp?: {
    win: number;
    draw: number;
    loss: number;
    lambdaMe: number;
    lambdaOpp: number;
  };
  /** 라인 강도(우리/상대). 대결 막대 계산용 */
  lines?: { me: LineStrengths; opp: LineStrengths };
}

// 반원 게이지 기하: 반지름 r, 왼→오른쪽 180° 호.
const R = 78;
const CX = 90;
const CY = 90;
const ARC_LEN = Math.PI * R;

// 반원 경로(좌하단 → 우하단, 위로 볼록)
const ARC_PATH = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

function useCountUp(target: number): number {
  const spring = useSpring(target, { stiffness: 90, damping: 18, mass: 0.6 });
  const [display, setDisplay] = useState(target);
  useMotionValueEvent(spring, "change", (v) => setDisplay(Math.round(v)));
  useEffect(() => {
    spring.set(target);
  }, [spring, target]);
  return display;
}

interface DuelRowProps {
  label: string;
  me: number;
  opp: number;
}

function DuelRow({ label, me, opp }: DuelRowProps) {
  const total = me + opp;
  const mePct = total > 0 ? (me / total) * 100 : 50;
  const meWins = me >= opp;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="stat-num text-ink">{Math.round(me)}</span>
        <span className="font-bold uppercase tracking-wide text-dim">{label}</span>
        <span className="stat-num text-dim">{Math.round(opp)}</span>
      </div>
      <div className="flex h-2 w-full items-center gap-0.5">
        <div className="flex h-full flex-1 justify-end overflow-hidden rounded-l-full bg-surface-2">
          <div
            className="h-full rounded-l-full"
            style={{
              width: `${mePct}%`,
              background: meWins ? "var(--color-accent)" : "var(--color-dim)",
            }}
          />
        </div>
        <div className="flex h-full flex-1 overflow-hidden rounded-r-full bg-surface-2">
          <div
            className="h-full rounded-r-full"
            style={{
              width: `${100 - mePct}%`,
              background: !meWins ? "var(--color-danger)" : "var(--color-dim)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function WinGauge({ wp, lines }: WinGaugeProps) {
  const winRaw = wp ? wp.win * 100 : 0;
  const win = wp ? Math.round(winRaw) : undefined;
  const draw = wp ? Math.round(wp.draw * 100) : undefined;
  const loss = wp ? Math.round(wp.loss * 100) : undefined;
  const favored = win !== undefined && loss !== undefined && win >= loss;

  const display = useCountUp(win ?? 0);

  // 직전 승률 대비 델타(%p). 첫 렌더에서는 표기하지 않는다.
  const prevWinRef = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    if (win === undefined) return;
    if (prevWinRef.current !== null && prevWinRef.current !== win) {
      setDelta(win - prevWinRef.current);
    }
    prevWinRef.current = win;
  }, [win]);

  const gaugeColor = favored ? "var(--color-gain)" : "var(--color-danger)";
  const fillLen = ((win ?? 0) / 100) * ARC_LEN;

  return (
    <div className="panel flex flex-col gap-5 rounded-[10px] p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow text-dim">라이브 승률 예측</p>
          <p className="mt-1 text-[11px] text-dim">조작할 때마다 실시간으로 다시 계산돼요.</p>
        </div>
        {delta !== null && delta !== 0 && (
          <span
            className="stat-num inline-flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs"
            style={{
              color: delta > 0 ? "var(--color-gain)" : "var(--color-danger)",
              background: delta > 0 ? "rgba(59,227,138,0.14)" : "rgba(255,92,122,0.14)",
            }}
            aria-label={`직전보다 ${delta > 0 ? "상승" : "하락"} ${Math.abs(delta)}퍼센트포인트`}
          >
            <span aria-hidden>{delta > 0 ? "▲" : "▼"}</span>
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta)}%p
          </span>
        )}
      </div>

      {/* 반원 게이지 + 대형 숫자 */}
      <div className="relative mx-auto w-full max-w-[220px]">
        <svg viewBox="0 0 180 104" className="w-full" aria-hidden>
          <path
            d={ARC_PATH}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={12}
            strokeLinecap="round"
          />
          <path
            d={ARC_PATH}
            fill="none"
            stroke={gaugeColor}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={`${fillLen} ${ARC_LEN}`}
            style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.3s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <div className="flex items-end gap-1">
            <span className="display stat-num text-6xl" style={{ color: gaugeColor }}>
              {win === undefined ? "--" : display}
            </span>
            <span className="mb-1.5 text-xl font-black text-dim">%</span>
          </div>
          <span className="text-xs font-bold text-ink">
            {favored ? "우리가 유리해요" : "상대가 유리해요"}
          </span>
        </div>
      </div>

      {/* 승/무/패 3분할 바 */}
      <div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-gain" style={{ width: `${win ?? 0}%`, transition: "width 0.5s ease" }} />
          <div className="h-full bg-dim/50" style={{ width: `${draw ?? 0}%`, transition: "width 0.5s ease" }} />
          <div className="h-full bg-danger" style={{ width: `${loss ?? 0}%`, transition: "width 0.5s ease" }} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="stat-num text-lg text-gain">{win ?? "--"}%</div>
            <div className="text-[11px] text-dim">승리</div>
          </div>
          <div>
            <div className="stat-num text-lg text-ink">{draw ?? "--"}%</div>
            <div className="text-[11px] text-dim">무승부</div>
          </div>
          <div>
            <div className="stat-num text-lg text-danger">{loss ?? "--"}%</div>
            <div className="text-[11px] text-dim">패배</div>
          </div>
        </div>
      </div>

      {/* 라인별 전력 대결 막대 */}
      {lines && (
        <div className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface/40 p-3">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
            <span className="text-accent">우리</span>
            <span className="text-dim">라인별 전력</span>
            <span className="text-danger">상대</span>
          </div>
          <DuelRow label="수비" me={lines.me.def} opp={lines.opp.def} />
          <DuelRow label="중원" me={lines.me.mid} opp={lines.opp.mid} />
          <DuelRow label="공격" me={lines.me.att} opp={lines.opp.att} />
        </div>
      )}
    </div>
  );
}
