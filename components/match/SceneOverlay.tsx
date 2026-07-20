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
}

export function SceneOverlay({ sceneEvents, attribution }: SceneOverlayProps) {
  const primary = primaryEvent(sceneEvents);
  const chain = sceneChain(sceneEvents);

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
            className="rounded-[10px] border px-4 py-3 backdrop-blur-md"
            style={{
              background: "rgba(6, 22, 14, 0.82)",
              borderColor: primary.side === "me" ? "rgba(200,255,60,0.4)" : "rgba(255,90,120,0.4)",
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="display rounded-md bg-accent px-1.5 py-0.5 text-xs font-bold text-black">
                {primary.minute}&#39;
              </span>
              {chain.length > 1 && (
                <span className="text-xs font-semibold tracking-wide text-dim">{chain.join(" → ")}</span>
              )}
            </div>
            <p className="mt-1.5 text-sm font-bold leading-snug text-white sm:text-base">{primary.textKo}</p>
            {attribution && (
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
