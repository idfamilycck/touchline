"use client";

// 라이브 미니 피치: 실제 축구처럼 팀 전체가 국면 따라 하프라인을 넘나든다.
// - 동적 전형(tilt): 공세면 수비수까지 상대 진영 근처로 전진, 수세면 전원 수축.
// - 평상시: 점유 팀 선수 사이 패스 순환 + 전원이 공 방향으로 흐름(followBall) + 미세 흔들림.
// - 장면: livepitch-choreo가 만든 안무 — 2:1 월패스 슛, 코너킥 크로스+헤딩 경합(센터백 가담).
// 장면은 페이지(sceneSeenRef)가 단일 소스로 내려준다. "me"는 오른쪽 골문을 공격한다.
// (스펙 §6: docs/superpowers/specs/2026-07-18-match-highlight-jump-design.md)

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MatchEventType } from "@/lib/engine/match";
import type { SideSetup } from "@/lib/types";
import { teamById } from "@/lib/data/teams";
import { playersOf } from "@/lib/data/players";
import { jerseyOf } from "@/components/tactics/tactics-labels";
import { dynamicDots, followBall, VB_W, VB_H } from "./livepitch-geometry";
import { buildSceneChoreo } from "./livepitch-choreo";

// 피치 라벨용 짧은 이름: 서양식 이름은 성(마지막 토큰)만, 한글 등 단일 토큰은 그대로.
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : full;
}

const CX = VB_W / 2;
const CY = VB_H / 2;

const PASS_MS = 1100; // 평상시 패스 순환 간격

/** 페이지가 내려주는 장면 요약 */
export interface ScenePlay {
  key: string; // 장면 식별자 (분+타입) — 키프레임 재시작용
  side: "me" | "opp";
  type: MatchEventType; // 헤드라인(골 플래시 판단)
  choreo: MatchEventType | null; // 안무 타입 (goal/corner/save/shot/chance, 없으면 null)
  playerId?: string;
}

// 슬롯별 결정적 미세 움직임(제자리 흔들림) 파라미터 — 정지 순간에도 살아있는 느낌.
function jitterOf(side: string, slotId: string): { ax: number; ay: number; dur: number } {
  let h = 0;
  for (const ch of `${side}-${slotId}`) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return {
    ax: 0.8 + (h % 5) * 0.25,
    ay: 0.8 + ((h >> 2) % 5) * 0.25,
    dur: 2.2 + (h % 7) * 0.25,
  };
}

interface LivePitchProps {
  meSetup: SideSetup;
  oppSetup: SideSetup;
  scene?: ScenePlay | null;
  /** 진형 쏠림 -1(상대 공세)~+1(우리 공세) — 국면(tilt) 산출에 쓴다 */
  lean?: number;
}

export function LivePitch({ meSetup, oppSetup, scene = null, lean = 0 }: LivePitchProps) {
  const meColor = teamById(meSetup.teamId)?.color2 ?? "var(--color-accent)";
  const oppColor = teamById(oppSetup.teamId)?.color1 ?? "var(--color-danger)";

  // 이름 라벨은 실제 온피치 두 팀의 선수 명단에서 조회한다 — 가상팀·월드컵팀 모두 대응.
  // (기존엔 정적 PLAYERS(16개국)만 봐서 월드컵 선수 이름이 비어 있었다.)
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of playersOf(meSetup.teamId)) m.set(p.id, shortName(p.name));
    for (const p of playersOf(oppSetup.teamId)) m.set(p.id, shortName(p.name));
    return m;
  }, [meSetup.teamId, oppSetup.teamId]);

  const possession = lean >= 0 ? "me" : "opp";

  // 국면: 장면 중엔 공격 측으로 강하게, 평상시엔 점유+흐름(lean)에 따라 완만하게.
  const tilt = scene
    ? scene.side === "me"
      ? 0.85
      : 0.15
    : 0.5 + lean * 0.16 + (possession === "me" ? 0.06 : -0.06);

  const dotsMe = useMemo(() => dynamicDots(meSetup, "me", tilt), [meSetup, tilt]);
  const dotsOpp = useMemo(() => dynamicDots(oppSetup, "opp", tilt), [oppSetup, tilt]);

  // ── 장면 안무 ──
  const choreo = useMemo(() => {
    if (!scene || !scene.choreo) return null;
    const attackDots = scene.side === "me" ? dotsMe : dotsOpp;
    return buildSceneChoreo(scene.choreo, scene.side, attackDots, scene.playerId);
  }, [scene, dotsMe, dotsOpp]);

  // ── 평상시 패스 순환 ──
  const [passStep, setPassStep] = useState(0);
  useEffect(() => {
    if (choreo) return;
    const id = setInterval(() => setPassStep((s) => s + 1), PASS_MS);
    return () => clearInterval(id);
  }, [choreo]);

  const chain = (possession === "me" ? dotsMe : dotsOpp).filter((d) => d.slotId !== "gk");
  const holder = chain.length > 0 ? chain[passStep % chain.length] : undefined;

  // 전원이 따라갈 공의 관심 지점: 안무 중엔 마지막 키프레임(결과 지점), 평상시엔 볼홀더.
  const ballPoint = choreo
    ? { cx: choreo.ball.xs[choreo.ball.xs.length - 1], cy: choreo.ball.ys[choreo.ball.ys.length - 1] }
    : { cx: (holder?.cx ?? CX) + (possession === "me" ? 5 : -5), cy: holder?.cy ?? CY };

  const pulseSlot = choreo?.shooterSlot ?? choreo?.headerSlot;

  return (
    <motion.div
      className="panel relative overflow-hidden rounded-3xl"
      animate={scene?.type === "goal" ? { x: [0, -5, 5, -4, 4, 0] } : { x: 0 }}
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
          <rect x={6} y={CY - 34} width={30} height={68} />
          <rect x={6} y={CY - 16} width={12} height={32} />
          <rect x={VB_W - 36} y={CY - 34} width={30} height={68} />
          <rect x={VB_W - 18} y={CY - 16} width={12} height={32} />
        </g>
        <circle cx={CX} cy={CY} r={1.6} fill="rgba(224,255,233,0.3)" />

        {/* 진영 방향 힌트 */}
        <text x={VB_W - 10} y={16} textAnchor="end" fontSize="9" fill="var(--color-dim)">
          → 우리 공격
        </text>

        {/* 양 팀 선수 22명 */}
        {([
          { dots: dotsMe, side: "me" as const, color: meColor },
          { dots: dotsOpp, side: "opp" as const, color: oppColor },
        ]).map(({ dots, side, color }) => (
          <g key={side}>
            {dots.map((d) => {
              const override = scene?.side === side ? choreo?.overrides[d.slotId] : undefined;
              const isPulse = scene?.side === side && pulseSlot === d.slotId;
              const isHolder = !choreo && holder !== undefined && possession === side && d.slotId === holder.slotId;
              // 위치: 안무 오버라이드 > 공 따라가기(라인별 강도)
              const follow = followBall(d, ballPoint);
              const tx = override ? override.cx : follow.tx;
              const ty = override ? override.cy : follow.ty;
              const jit = jitterOf(side, d.slotId);
              return (
                <motion.g
                  key={`${side}-${d.slotId}`}
                  initial={false}
                  animate={{ x: tx, y: ty }}
                  transition={{ type: "spring", stiffness: override ? 70 : 120, damping: 18 }}
                >
                  {/* 슬롯별 미세 흔들림 — 정지 순간에도 제자리에서 살아 움직인다 */}
                  <motion.g
                    animate={{
                      x: [0, jit.ax, -jit.ax * 0.6, 0],
                      y: [0, -jit.ay * 0.7, jit.ay, 0],
                    }}
                    transition={{ duration: jit.dur, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {/* 확대는 r 애니메이션 대신 transform scale — SVG 속성 r은 framer가
                        마운트 시점에 undefined로 읽어 콘솔 에러를 내는 문제가 있다. */}
                    <motion.g
                      initial={false}
                      animate={isPulse ? { scale: [1, 1.35, 1] } : { scale: isHolder ? 1.15 : 1 }}
                      transition={
                        isPulse
                          ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
                          : { duration: 0.25 }
                      }
                    >
                      <circle
                        r={5.5}
                        fill={color}
                        stroke={isPulse ? "var(--color-accent)" : "rgba(6,20,12,0.55)"}
                        strokeWidth={isPulse ? 1.4 : 1}
                      />
                    </motion.g>
                    <text
                      textAnchor="middle"
                      dy={1.8}
                      fontSize="5"
                      fontWeight={700}
                      fill="#f2fff6"
                      stroke="rgba(0,0,0,0.45)"
                      strokeWidth={0.5}
                      paintOrder="stroke"
                    >
                      {jerseyOf(d.playerId)}
                    </text>
                    <text
                      textAnchor="middle"
                      dy={11.5}
                      fontSize="3.6"
                      fontWeight={isPulse ? 800 : 600}
                      fill={isPulse ? "var(--color-accent)" : "rgba(230,255,240,0.82)"}
                      stroke="rgba(0,0,0,0.55)"
                      strokeWidth={0.45}
                      paintOrder="stroke"
                    >
                      {nameById.get(d.playerId) ?? ""}
                    </text>
                  </motion.g>
                </motion.g>
              );
            })}
          </g>
        ))}

        {/* 공: 평상시엔 점유 팀 패스 순환, 장면엔 안무 키프레임(월패스/코너 크로스) */}
        {choreo ? (
          <motion.circle
            key={scene!.key}
            r={4}
            fill="#f6fff0"
            stroke="#0a1f13"
            strokeWidth={1}
            initial={{ cx: choreo.ball.xs[0], cy: choreo.ball.ys[0] }}
            animate={{ cx: choreo.ball.xs, cy: choreo.ball.ys }}
            transition={{ duration: choreo.ball.dur, times: choreo.ball.times, ease: "easeInOut" }}
          />
        ) : (
          <motion.circle
            key="ball-idle"
            r={4}
            fill="#f6fff0"
            stroke="#0a1f13"
            strokeWidth={1}
            initial={false}
            animate={{
              cx: (holder?.cx ?? CX) + (possession === "me" ? 5 : -5),
              cy: holder?.cy ?? CY,
            }}
            transition={{ duration: 0.75, ease: "easeInOut" }}
          />
        )}
      </svg>

      {/* 골 플래시 */}
      <AnimatePresence>
        {scene?.type === "goal" && (
          <motion.div
            key={scene.key}
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
