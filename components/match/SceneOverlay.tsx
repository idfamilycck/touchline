"use client";

// 장면 모드 자막 오버레이: 하이라이트 분에 라이브 피치 위로 헤드라인·체인·발동 전술 칩을 띄운다.
// (스펙 §2 — 하이라이트 점프 재생의 장면 자막 + 전술 귀속)

import { AnimatePresence, motion } from "framer-motion";
import type { MatchEvent } from "@/lib/engine/match";
import type { AppliedRule } from "@/lib/engine/modifiers";
import { primaryEvent, sceneChain } from "./scene";

interface SceneOverlayProps {
  sceneEvents: MatchEvent[]; // 빈 배열이면 렌더 안 함
  attribution: AppliedRule | null; // 공격 장면일 때 발동 전술 (없으면 칩 생략)
  /**
   * 골 장면에서 공이 실제로 골문에 닿았는가. false인 동안에는 결과("...의 골!")를
   * 감추고 빌드업(찬스 -> 슛)까지만 보여준다. 공이 아직 중원에 있는데 골 문구가
   * 먼저 뜨면 중계로서 가장 어색한 어긋남이 된다.
   */
  goalArrived?: boolean;
}

export function SceneOverlay({ sceneEvents, attribution, goalArrived = true }: SceneOverlayProps) {
  const primary = primaryEvent(sceneEvents);
  const fullChain = sceneChain(sceneEvents);
  const isGoal = primary?.type === "goal";
  const pending = isGoal && !goalArrived;

  // 도착 전에는 체인의 마지막 고리("골!")를 빼고, 문구도 진행형으로 바꾼다.
  const chain = pending ? fullChain.slice(0, -1) : fullChain;
  const headline = pending ? "슛이 골문으로 향합니다" : (primary?.textKo ?? "");
  // 골이 확정된 순간(공 도착)엔 중계 자막을 크게 키우고 "GOAL" 태그를 붙여
  // "대시보드"가 아니라 "방송"의 호흡을 준다.
  const confirmedGoal = isGoal && !pending;

  return (
    <AnimatePresence>
      {primary && (
        <motion.div
          key={`${primary.minute}-${primary.type}`}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4 sm:px-6"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          role="status"
          aria-live="polite"
        >
          <div
            className="rounded-panel border px-4 py-3 backdrop-blur-md"
            style={{
              background: "rgba(6, 22, 14, 0.82)",
              borderColor: primary.side === "me" ? "rgba(34,211,238,0.4)" : "rgba(255,90,120,0.4)",
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="display rounded-md bg-accent px-1.5 py-0.5 text-xs font-bold text-black">
                {primary.minute}&#39;
              </span>
              {confirmedGoal && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 14 }}
                  className="display rounded-md px-2 py-0.5 text-xs font-black tracking-wide text-white"
                  style={{ background: primary.side === "me" ? "var(--color-accent)" : "var(--color-danger)" }}
                >
                  ⚽ GOAL
                </motion.span>
              )}
              {chain.length > 1 && (
                <span className="text-xs font-semibold tracking-wide text-dim">{chain.join(" → ")}</span>
              )}
            </div>
            <p
              className={`mt-1.5 font-bold leading-snug text-white ${
                confirmedGoal ? "text-lg sm:text-2xl" : "text-sm sm:text-base"
              }`}
            >
              {headline}
            </p>
            {/* 발동 전술 칩은 결과가 확정된 뒤에 붙인다(빌드업 중에는 아직 근거가 아니다). */}
            {attribution && !pending && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-dim">
                <span
                  className="rounded-full border border-current px-1.5 py-0.5 font-semibold"
                  style={{ color: primary.side === "me" ? "var(--color-accent)" : "var(--color-danger)" }}
                >
                  발동 전술
                </span>
                <span className="min-w-0">{attribution.textKo}</span>
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
