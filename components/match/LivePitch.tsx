"use client";

// 라이브 미니 피치: 가로형 SVG. 새 이벤트(chance/shot/goal/save/corner)가 들어오면
// 해당 진영에서 공·점이 골문 쪽으로 이동하는 1.4초 시퀀스를 재생하고, 골이면 플래시 +
// 셰이크. 이벤트가 없으면 중원 점유 루프. "me"는 오른쪽, "opp"는 왼쪽 골문을 공격한다.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MatchEvent } from "@/lib/engine/match";
import { teamById } from "@/lib/data/teams";

const VB_W = 300;
const VB_H = 180;
const CX = VB_W / 2;
const CY = VB_H / 2;
const GOAL_R_X = 288; // me 공격(오른쪽) 목표
const GOAL_L_X = 12; // opp 공격(왼쪽) 목표

const HIGHLIGHT_TYPES = new Set(["chance", "shot", "goal", "save", "corner"]);

interface Highlight {
  id: string;
  side: "me" | "opp";
  isGoal: boolean;
}

interface LivePitchProps {
  events: MatchEvent[];
  meTeamId: string;
  oppTeamId: string;
}

export function LivePitch({ events, meTeamId, oppTeamId }: LivePitchProps) {
  const meColor = teamById(meTeamId)?.color2 ?? "var(--color-accent)";
  const oppColor = teamById(oppTeamId)?.color1 ?? "var(--color-danger)";

  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const lastKeyRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 가장 최근의 하이라이트 대상 이벤트를 찾는다.
    let latest: MatchEvent | undefined;
    let latestIdx = -1;
    for (let i = events.length - 1; i >= 0; i--) {
      if (HIGHLIGHT_TYPES.has(events[i].type)) {
        latest = events[i];
        latestIdx = i;
        break;
      }
    }
    if (!latest) return;
    const key = `${latestIdx}-${latest.minute}-${latest.type}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    setHighlight({ id: key, side: latest.side, isGoal: latest.type === "goal" });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHighlight(null), 1500);
  }, [events]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const attackRight = highlight?.side === "me";
  const goalX = attackRight ? GOAL_R_X : GOAL_L_X;
  const startX = attackRight ? CX - 40 : CX + 40;
  const attColor = attackRight ? meColor : oppColor;

  return (
    <motion.div
      className="panel relative overflow-hidden rounded-3xl"
      animate={highlight?.isGoal ? { x: [0, -5, 5, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full" role="img" aria-label="라이브 경기 피치">
        {/* 잔디 이랑 */}
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x={(VB_W / 8) * i}
            y={0}
            width={VB_W / 8}
            height={VB_H}
            fill={i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"}
          />
        ))}
        {/* 라인 */}
        <g fill="none" stroke="rgba(224,255,233,0.16)" strokeWidth={1}>
          <rect x={6} y={6} width={VB_W - 12} height={VB_H - 12} />
          <line x1={CX} y1={6} x2={CX} y2={VB_H - 6} />
          <circle cx={CX} cy={CY} r={26} />
          {/* 왼쪽(우리가 아닌 opp 목표) 박스 */}
          <rect x={6} y={CY - 34} width={30} height={68} />
          <rect x={6} y={CY - 16} width={12} height={32} />
          {/* 오른쪽 박스 */}
          <rect x={VB_W - 36} y={CY - 34} width={30} height={68} />
          <rect x={VB_W - 18} y={CY - 16} width={12} height={32} />
        </g>
        <circle cx={CX} cy={CY} r={1.6} fill="rgba(224,255,233,0.3)" />

        {/* 진영 방향 힌트 */}
        <text x={VB_W - 10} y={16} textAnchor="end" fontSize="9" fill="var(--color-dim)">
          → 우리 공격
        </text>

        <AnimatePresence mode="wait">
          {highlight ? (
            <motion.g key={highlight.id}>
              {/* 공격 점 3개 */}
              {[-14, 0, 16].map((off, i) => (
                <motion.circle
                  key={i}
                  r={5}
                  fill={attColor}
                  stroke="rgba(0,0,0,0.3)"
                  strokeWidth={0.8}
                  initial={{ cx: startX - (attackRight ? 20 : -20), cy: CY + off }}
                  animate={{ cx: goalX - (attackRight ? 24 : -24) + i * (attackRight ? 6 : -6), cy: CY + off * 0.5 }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                />
              ))}
              {/* 공 */}
              <motion.circle
                r={4}
                fill="#f6fff0"
                stroke="#0a1f13"
                strokeWidth={1}
                initial={{ cx: startX, cy: CY }}
                animate={{ cx: goalX, cy: CY }}
                transition={{ duration: 1.2, ease: "easeIn" }}
              />
            </motion.g>
          ) : (
            // 중원 점유 루프
            <motion.circle
              key="idle"
              r={4}
              fill="#f6fff0"
              stroke="#0a1f13"
              strokeWidth={1}
              initial={{ cx: CX - 30, cy: CY - 12 }}
              animate={{
                cx: [CX - 30, CX + 10, CX + 30, CX - 10, CX - 30],
                cy: [CY - 12, CY + 14, CY - 8, CY + 10, CY - 12],
              }}
              transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
            />
          )}
        </AnimatePresence>
      </svg>

      {/* 골 플래시 */}
      <AnimatePresence>
        {highlight?.isGoal && (
          <motion.div
            key="flash"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, times: [0, 0.2, 1] }}
            style={{ background: "radial-gradient(circle, rgba(200,255,60,0.5), transparent 70%)" }}
          >
            <span className="display text-4xl text-accent" style={{ textShadow: "0 2px 20px rgba(0,0,0,0.6)" }}>
              GOAL!
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
