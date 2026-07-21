"use client";

// 모바일 전용 승률 스트립.
// 데스크톱에선 분석 열의 WinGauge가 항상 보이지만, 모바일에선 승률 게이지가 "분석"
// 탭 뒤에 숨는다. 이 앱의 핵심 경험 — "전술을 바꾸면 승률이 즉시 반응한다" — 이
// 모바일에서 안 보이면 감독 시뮬의 재미가 통째로 사라진다. 그래서 어느 탭(스쿼드/
// 피치/분석)에서 조작하든 항상 보이도록 탭 스위처 바로 아래에 얇게 고정하고,
// 델타 칩으로 "방금 그 조작이 승률을 얼마나 움직였는지"를 수치로 병기한다.

import { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useSpring } from "framer-motion";
import { EDGE_COLOR, edgeToneFromWinLoss, type EdgeTone } from "@/lib/edge-tone";

interface Props {
  wp?: { win: number; draw: number; loss: number };
}

const TONE_LABEL: Record<EdgeTone, string> = {
  favored: "우리 우세",
  even: "팽팽",
  behind: "상대 우세",
};

export function MobileWinStrip({ wp }: Props) {
  const win = wp ? Math.round(wp.win * 100) : undefined;
  const draw = wp ? Math.round(wp.draw * 100) : undefined;
  const loss = wp ? Math.round(wp.loss * 100) : undefined;
  const tone: EdgeTone = wp
    ? edgeToneFromWinLoss(wp.win * 100, wp.loss * 100)
    : "even";
  const color = EDGE_COLOR[tone];

  // 대형 숫자 카운트업(WinGauge와 동일한 스프링 감).
  const spring = useSpring(win ?? 0, { stiffness: 90, damping: 18, mass: 0.6 });
  const [display, setDisplay] = useState(win ?? 0);
  useMotionValueEvent(spring, "change", (v) => setDisplay(Math.round(v)));
  useEffect(() => {
    spring.set(win ?? 0);
  }, [spring, win]);

  // 직전 승률 대비 델타(%p). 첫 렌더에선 표기하지 않는다.
  const prev = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    if (win === undefined) return;
    if (prev.current !== null && prev.current !== win) {
      setDelta(win - prev.current);
    }
    prev.current = win;
  }, [win]);

  return (
    <div className="mt-2 rounded-control border border-line bg-surface/50 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="eyebrow text-dim">라이브 승률</span>
          <span className="stat-num text-2xl leading-none" style={{ color }}>
            {win === undefined ? "--" : display}
            <span className="ml-0.5 text-sm font-black text-dim">%</span>
          </span>
          <span className="text-[12px] font-bold text-ink">
            {TONE_LABEL[tone]}
          </span>
        </div>
        {delta !== null && delta !== 0 && (
          <span
            className="stat-num inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[12px]"
            style={{
              color: delta > 0 ? "var(--color-gain)" : "var(--color-danger)",
              background:
                delta > 0 ? "rgba(59,227,138,0.14)" : "rgba(255,92,122,0.14)",
            }}
            aria-label={`직전보다 ${delta > 0 ? "상승" : "하락"} ${Math.abs(
              delta
            )}퍼센트포인트`}
          >
            <span aria-hidden>{delta > 0 ? "▲" : "▼"}</span>
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta)}%p
          </span>
        )}
      </div>

      {/* 승/무/패 3분할 얇은 바 */}
      <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full bg-gain"
          style={{ width: `${win ?? 0}%`, transition: "width 0.5s ease" }}
        />
        <div
          className="h-full bg-dim/50"
          style={{ width: `${draw ?? 0}%`, transition: "width 0.5s ease" }}
        />
        <div
          className="h-full bg-danger"
          style={{ width: `${loss ?? 0}%`, transition: "width 0.5s ease" }}
        />
      </div>
    </div>
  );
}
