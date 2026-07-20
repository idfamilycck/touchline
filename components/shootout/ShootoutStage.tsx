"use client";

// 승부차기 연출: 미리 계산된 rounds를 "차기" 버튼 1회당 한 세트(우리 킥 → 상대 킥)씩
// 재생한다. 볼 애니메이션(Framer Motion)·골/실축 플래시·득점 도트로 서스펜스를 준다.
// 결과는 이미 store.runShootout으로 확정돼 있고 이 컴포넌트는 "재생"만 담당한다.

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { playersOf } from "@/lib/data/players";
import { teamById } from "@/lib/data/teams";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { jerseyOf } from "@/components/tactics/tactics-labels";
import type { ShootoutResult } from "@/lib/engine/shootout";
import type { SideSetup } from "@/lib/types";

interface ShootoutStageProps {
  result: ShootoutResult;
  meSetup: SideSetup;
  oppSetup: SideSetup;
  onFinish: () => void;
}

const ME_ANIM = 850;
const OPP_ANIM = 900;
const SUDDEN_DEATH_FROM = 10; // 정규 10킥(5라운드) 이후는 서든데스

function nameOf(teamId: string, playerId: string): string {
  return playersOf(teamId).find((p) => p.id === playerId)?.name ?? "선수";
}

// 한 팀의 득점 도트: 이미 공개된 라운드만 표시한다.
function ScoreDots({
  rounds,
  side,
  revealedCount,
}: {
  rounds: ShootoutResult["rounds"];
  side: "me" | "opp";
  revealedCount: number;
}) {
  const shown = rounds.filter((r, i) => r.side === side && i < revealedCount);
  return (
    <div className="flex flex-wrap gap-1" aria-hidden>
      {shown.map((r, i) => (
        <span
          key={i}
          className="text-base leading-none"
          style={{ color: r.scored ? "var(--color-gain)" : "var(--color-danger)" }}
        >
          {r.scored ? "●" : "○"}
        </span>
      ))}
    </div>
  );
}

export function ShootoutStage({ result, meSetup, oppSetup, onFinish }: ShootoutStageProps) {
  const { rounds, winner } = result;
  const me = teamById(meSetup.teamId);
  const opp = teamById(oppSetup.teamId);

  const [revealed, setRevealed] = useState(0);
  const [busy, setBusy] = useState(false);

  const meScore = useMemo(
    () => rounds.filter((r, i) => r.side === "me" && i < revealed && r.scored).length,
    [rounds, revealed]
  );
  const oppScore = useMemo(
    () => rounds.filter((r, i) => r.side === "opp" && i < revealed && r.scored).length,
    [rounds, revealed]
  );

  const done = revealed >= rounds.length;
  const active = revealed > 0 ? rounds[revealed - 1] : null;
  const activeIndex = revealed - 1;
  const isSuddenDeath = activeIndex >= SUDDEN_DEATH_FROM;

  const kick = () => {
    if (busy || done) return;
    setBusy(true);
    // 우리 킥 공개
    setRevealed((r) => r + 1);
    // 애니메이션 후 상대 킥 자동 공개
    window.setTimeout(() => {
      setRevealed((r) => (r < rounds.length && rounds[r].side === "opp" ? r + 1 : r));
      window.setTimeout(() => setBusy(false), OPP_ANIM);
    }, ME_ANIM);
  };

  const activeTeamId = active ? (active.side === "me" ? meSetup.teamId : oppSetup.teamId) : "";
  const activeName = active ? nameOf(activeTeamId, active.playerId) : "";
  const activeColor = active
    ? active.side === "me"
      ? me?.color1 ?? "var(--color-accent)"
      : opp?.color1 ?? "var(--color-danger)"
    : "var(--color-accent)";

  return (
    <div className="flex flex-col gap-4">
      {/* 스코어 헤더 */}
      <div className="panel rounded-[10px] px-4 py-4">
        <p className="eyebrow text-center text-accent">승부차기</p>
        <div className="mt-2 flex items-center justify-center gap-5">
          <div className="flex flex-1 flex-col items-end gap-1.5">
            <span className="text-sm font-bold text-ink">{me?.nameKo ?? "우리"}</span>
            <ScoreDots rounds={rounds} side="me" revealedCount={revealed} />
          </div>
          <div className="stat-num display shrink-0 text-4xl text-ink">
            {meScore}<span className="px-1 text-dim">:</span>{oppScore}
          </div>
          <div className="flex flex-1 flex-col items-start gap-1.5">
            <span className="text-sm font-bold text-ink">{opp?.nameKo ?? "상대"}</span>
            <ScoreDots rounds={rounds} side="opp" revealedCount={revealed} />
          </div>
        </div>
        {isSuddenDeath && !done && (
          <p className="mt-3 text-center text-xs font-black uppercase tracking-widest text-danger">
            ⚡ 서든데스
          </p>
        )}
      </div>

      {/* 골대 + 볼 연출 */}
      <div className="panel relative flex flex-col items-center overflow-hidden rounded-[10px] px-4 pb-5 pt-6">
        <div className="pitch-stripes pointer-events-none absolute inset-0 opacity-40" aria-hidden />

        {/* 골대 프레임 */}
        <div className="relative z-10 h-20 w-56 max-w-full">
          <div
            className="absolute inset-x-0 top-0 h-full rounded-t-md border-x-4 border-t-4"
            style={{ borderColor: "rgba(234,244,236,0.55)" }}
          />
          <div
            className="absolute inset-0 top-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(234,244,236,0.35) 1px, transparent 1px), linear-gradient(rgba(234,244,236,0.35) 1px, transparent 1px)",
              backgroundSize: "12px 12px",
            }}
            aria-hidden
          />
        </div>

        {/* 볼 */}
        <div className="relative z-10 mt-2 h-24 w-full">
          <AnimatePresence mode="wait">
            {active && (
              <motion.div
                key={revealed}
                className="absolute left-1/2 top-full text-2xl"
                initial={{ x: "-50%", y: 0, opacity: 0, scale: 1 }}
                animate={
                  active.scored
                    ? { x: "-50%", y: -150, opacity: 1, scale: 0.7 }
                    : {
                        x: active.side === "me" ? "20%" : "-120%",
                        y: -120,
                        opacity: 1,
                        scale: 0.7,
                      }
                }
                transition={{ duration: 0.7, ease: "easeOut" }}
                aria-hidden
              >
                ⚽
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 결과 플래시 */}
        <div className="relative z-10 -mt-2 h-8">
          <AnimatePresence mode="wait">
            {active && (
              <motion.p
                key={`flash-${revealed}`}
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="text-center text-xl font-black"
                style={{ color: active.scored ? "var(--color-gain)" : "var(--color-danger)" }}
              >
                {active.scored ? "골! ⚽" : "실축! 🧤"}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* 현재 키커 */}
        <div className="relative z-10 mt-2 flex min-h-[52px] items-center gap-3">
          {active ? (
            <>
              <PlayerAvatar
                name={activeName}
                number={jerseyOf(active.playerId)}
                size={40}
                ring={activeColor}
              />
              <div>
                <p className="text-sm font-black text-ink">{activeName}</p>
                <p className="text-[11px] text-dim">
                  {active.side === "me" ? me?.nameKo ?? "우리" : opp?.nameKo ?? "상대"} · {isSuddenDeath ? "서든데스" : `${Math.floor(activeIndex / 2) + 1}번째 키커`}
                </p>
              </div>
            </>
          ) : (
            <p className="text-sm text-dim">아래 “차기”를 눌러 첫 키커를 내보내세요.</p>
          )}
        </div>
      </div>

      {/* 컨트롤 / 결과 */}
      {done ? (
        <div className="panel rounded-[10px] p-5 text-center">
          <p className="eyebrow text-accent">승부차기 종료</p>
          <h2
            className="display mt-2 text-3xl"
            style={{ color: winner === "me" ? "var(--color-gain)" : "var(--color-danger)" }}
          >
            {winner === "me" ? "승리했습니다!" : "패배했습니다"}
          </h2>
          <p className="stat-num mt-1 text-lg text-dim">
            {meScore} : {oppScore}
          </p>
          <button
            type="button"
            onClick={onFinish}
            className="mt-5 w-full rounded-full bg-accent py-4 text-base font-black text-accent-ink transition-transform hover:-translate-y-0.5"
          >
            결과 보기 →
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={kick}
          disabled={busy}
          className="sticky bottom-3 z-10 w-full rounded-full bg-accent py-4 text-base font-black text-accent-ink shadow-lg transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "…" : "차기"}
        </button>
      )}
    </div>
  );
}
