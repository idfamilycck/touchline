"use client";

// 라이브 미니 피치: 가로형 SVG. 양 팀 22명을 포메이션 좌표대로 상시 표시한다.
// 공은 항상 "선수와 함께" 움직인다 — 평상시엔 점유 팀(lean 부호) 선수들 사이를
// 후방→전방 순서로 패스 순환하고, 공격 장면에선 동료 → 주인공(전진 위치) → 결과
// 지점(골망/GK 앞/코너)으로 이동하며 주인공 선수 점이 실제로 전진한다. "me"는
// 오른쪽 골문을 공격한다. 장면은 페이지(sceneSeenRef)가 단일 소스로 내려준다.
// (스펙 §6: docs/superpowers/specs/2026-07-18-match-highlight-jump-design.md)

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MatchEventType } from "@/lib/engine/match";
import type { SideSetup } from "@/lib/types";
import { teamById } from "@/lib/data/teams";
import { PLAYERS } from "@/lib/data/players";
import { jerseyOf } from "@/components/tactics/tactics-labels";
import { playerDots, followBall, VB_W, VB_H, type PlayerDot } from "./livepitch-geometry";

// 슬롯별 결정적 미세 움직임(제자리 흔들림) 파라미터 — 정지 순간에도 살아있는 느낌.
function jitterOf(side: string, slotId: string): { ax: number; ay: number; dur: number } {
  let h = 0;
  for (const ch of `${side}-${slotId}`) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return {
    ax: 0.8 + (h % 5) * 0.25, // 0.8~1.8px
    ay: 0.8 + ((h >> 2) % 5) * 0.25,
    dur: 2.2 + (h % 7) * 0.25, // 2.2~3.7s
  };
}

const NAME_BY_ID = new Map(PLAYERS.map((p) => [p.id, p.name]));

const CX = VB_W / 2;
const CY = VB_H / 2;
const GOAL_R_X = 288; // me 공격(오른쪽) 목표
const GOAL_L_X = 12; // opp 공격(왼쪽) 목표

const PASS_MS = 1100; // 평상시 패스 순환 간격

/** 페이지가 내려주는 장면 요약 (주 이벤트 기준) */
export interface ScenePlay {
  key: string; // 장면 식별자 (분+타입) — 키프레임 재시작용
  side: "me" | "opp";
  type: MatchEventType;
  playerId?: string;
}

const BALL_SCENE_TYPES = new Set<MatchEventType>(["chance", "shot", "goal", "save", "corner"]);

interface LivePitchProps {
  meSetup: SideSetup;
  oppSetup: SideSetup;
  scene?: ScenePlay | null;
  /** 진형 쏠림 -1(상대 공세)~+1(우리 공세): 양 팀이 공 방향으로 살짝 이동 */
  lean?: number;
}

function dist(a: PlayerDot, b: PlayerDot): number {
  return (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
}

export function LivePitch({ meSetup, oppSetup, scene = null, lean = 0 }: LivePitchProps) {
  const meColor = teamById(meSetup.teamId)?.color2 ?? "var(--color-accent)";
  const oppColor = teamById(oppSetup.teamId)?.color1 ?? "var(--color-danger)";

  const dotsMe = useMemo(() => playerDots(meSetup, "me"), [meSetup]);
  const dotsOpp = useMemo(() => playerDots(oppSetup, "opp"), [oppSetup]);

  // ── 평상시 패스 순환: 점유 팀 선수(GK 제외)를 후방→전방 순서로 도는 커서 ──
  const [passStep, setPassStep] = useState(0);
  const ballScene = scene !== null && BALL_SCENE_TYPES.has(scene.type);
  useEffect(() => {
    if (ballScene) return; // 장면 중엔 패스 순환 정지 (crisis/card는 순환 유지)
    const id = setInterval(() => setPassStep((s) => s + 1), PASS_MS);
    return () => clearInterval(id);
  }, [ballScene]);

  const possession = lean >= 0 ? "me" : "opp";
  const chain = (possession === "me" ? dotsMe : dotsOpp).filter((d) => d.slotId !== "gk");
  const holder = chain.length > 0 ? chain[passStep % chain.length] : undefined;

  // ── 장면 연출: 주인공·동료 전진 오버라이드 + 공 키프레임 ──
  const attackRight = scene?.side === "me";
  const sceneDots = scene ? (scene.side === "me" ? dotsMe : dotsOpp) : [];
  const shooter =
    ballScene && scene
      ? (sceneDots.find((d) => d.playerId === scene.playerId) ?? sceneDots[sceneDots.length - 1])
      : undefined;

  // 주인공 전진 위치: 공격 서드 박스 부근, 폭은 중앙 쪽으로 40% 수렴
  const advanced = shooter
    ? {
        cx: attackRight ? Math.max(shooter.cx, VB_W - 66) : Math.min(shooter.cx, 66),
        cy: shooter.cy + (CY - shooter.cy) * 0.4,
      }
    : undefined;

  // 전진 동료 2명: 주인공과 가까운 같은 팀 필드플레이어
  const mates = useMemo(() => {
    if (!shooter) return new Set<string>();
    return new Set(
      sceneDots
        .filter((d) => d.slotId !== "gk" && d.slotId !== shooter.slotId)
        .sort((a, b) => dist(a, shooter) - dist(b, shooter))
        .slice(0, 2)
        .map((d) => d.slotId)
    );
    // sceneDots는 shooter에서 파생되므로 shooter만 의존해도 충분하다.
  }, [shooter, sceneDots]); // eslint-disable-line react-hooks/exhaustive-deps

  // 공 목표: 골=골망 안, 선방=GK 앞, 코너=코너 깃발, 찬스/슛=골문 근처
  const outcome = (() => {
    if (!scene || !ballScene) return undefined;
    const gx = attackRight ? GOAL_R_X : GOAL_L_X;
    switch (scene.type) {
      case "goal":
        return { cx: attackRight ? gx + 2 : gx - 2, cy: CY };
      case "save":
        return { cx: attackRight ? gx - 10 : gx + 10, cy: CY };
      case "corner":
        return { cx: attackRight ? VB_W - 8 : 8, cy: 10 };
      default:
        return { cx: attackRight ? gx - 16 : gx + 16, cy: CY + 10 };
    }
  })();

  // 공 출발점: 주인공과 가장 가까운 동료(후방 전개 느낌), 없으면 주인공 원위치
  const ballStart = (() => {
    if (!shooter) return undefined;
    const mateId = [...mates][0];
    const mate = sceneDots.find((d) => d.slotId === mateId);
    return mate ?? shooter;
  })();

  const dir = attackRight ? 1 : -1;

  // 전원이 따라갈 공의 현재 관심 지점: 장면 중엔 결과 지점, 평상시엔 볼홀더.
  const ballPoint =
    ballScene && outcome
      ? outcome
      : { cx: (holder?.cx ?? CX) + (possession === "me" ? 5 : -5), cy: holder?.cy ?? CY };

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
          <motion.g
            key={side}
            initial={false}
            animate={{ x: lean * 6 }}
            transition={{ type: "spring", stiffness: 40, damping: 16 }}
          >
            {dots.map((d) => {
              const isShooter = shooter !== undefined && scene?.side === side && d.slotId === shooter.slotId;
              const isMate = scene?.side === side && mates.has(d.slotId);
              const isHolder = !ballScene && holder !== undefined && possession === side && d.slotId === holder.slotId;
              // 위치: 주인공은 전진 위치, 동료는 부분 전진, 나머지 전원은 공을 따라
              // 라인별 강도만큼 이동(실제 팀 전형처럼 공 방향으로 흐른다).
              const follow = followBall(d, ballPoint);
              const tx = isShooter && advanced ? advanced.cx : isMate ? follow.tx + dir * 10 : follow.tx;
              const ty = isShooter && advanced ? advanced.cy : isMate ? follow.ty + (CY - follow.ty) * 0.15 : follow.ty;
              const emphasized = isShooter || isHolder;
              const jit = jitterOf(side, d.slotId);
              return (
                <motion.g
                  key={`${side}-${d.slotId}`}
                  initial={false}
                  animate={{ x: tx, y: ty }}
                  transition={{ type: "spring", stiffness: 120, damping: 18 }}
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
                    animate={isShooter ? { scale: [1, 1.3, 1] } : { scale: emphasized ? 1.15 : 1 }}
                    transition={
                      isShooter
                        ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" }
                        : { duration: 0.25 }
                    }
                  >
                    <circle
                      r={5.5}
                      fill={color}
                      stroke={isShooter ? "var(--color-accent)" : "rgba(6,20,12,0.55)"}
                      strokeWidth={isShooter ? 1.4 : 1}
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
                    fontWeight={isShooter ? 800 : 600}
                    fill={isShooter ? "var(--color-accent)" : "rgba(230,255,240,0.82)"}
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={0.45}
                    paintOrder="stroke"
                  >
                    {NAME_BY_ID.get(d.playerId) ?? ""}
                  </text>
                  </motion.g>
                </motion.g>
              );
            })}
          </motion.g>
        ))}

        {/* 공: 평상시엔 점유 팀 선수 사이 패스 순환, 공격 장면엔 동료→주인공→결과 지점 */}
        {ballScene && ballStart && advanced && outcome ? (
          <motion.circle
            key={scene!.key}
            r={4}
            fill="#f6fff0"
            stroke="#0a1f13"
            strokeWidth={1}
            initial={{ cx: ballStart.cx, cy: ballStart.cy }}
            animate={{
              cx: [ballStart.cx, advanced.cx + dir * 6, outcome.cx],
              cy: [ballStart.cy, advanced.cy, outcome.cy],
            }}
            transition={{ duration: 1.3, times: [0, 0.45, 1], ease: "easeInOut" }}
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
