"use client";

// 지휘봉 인계 순간(rewrite 전용). 결정적 순간을 고르고 작전실에 들어서는 찰나에
// 뜨는 시네마틱 비트다. "팀을 인수한다"가 아니라 "그 순간 터치라인에 뛰어들어
// 지휘봉을 잡는다"는 감정을 만드는 게 목적 — 실제 경기의 인수 시점 스코어·분을
// 방송 로어서드처럼 보여주고 "지금부터 당신의 경기입니다"로 감독 정체성을 넘긴다.
//
// 노출: 작전실(app/tactics/page.tsx)이 rewrite 모드로 진입할 때 순간(momentId)마다
// 한 번(sessionStorage 게이팅). 작전실 튜토리얼 Coachmarks(localStorage, 최초 1회)와는
// 성격이 달라 별개로 둔다. z-index를 코치마크(z-50)보다 위(z-[60])로 둬, 첫 방문 시
// 서사 비트(인계) → 조작 튜토리얼(코치마크) 순서로 자연스럽게 이어진다.

import { motion } from "framer-motion";
import { ArrowRight } from "@phosphor-icons/react";

interface HandoffOverlayProps {
  meNameKo: string;
  oppNameKo: string;
  meCode: string;
  oppCode: string;
  minute: number;
  scoreMe: number;
  scoreOpp: number;
  onStart: () => void;
}

export function HandoffOverlay({
  meNameKo,
  oppNameKo,
  meCode,
  oppCode,
  minute,
  scoreMe,
  scoreOpp,
  onStart,
}: HandoffOverlayProps) {
  // 스코어 색: 우리가 뒤지고 있으면 danger, 앞서면 gain, 동점이면 중립. 인수 순간의
  // 긴박함(뒤지고 있다면 "뒤집어야 한다")을 색으로 즉시 전한다.
  const scoreColor =
    scoreMe > scoreOpp
      ? "var(--color-gain)"
      : scoreMe < scoreOpp
        ? "var(--color-danger)"
        : "var(--color-ink)";

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-pitch/95 px-6 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
    >
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <motion.p
          className="eyebrow text-accent"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          지휘봉 인계
        </motion.p>

        {/* 방송 로어서드 톤의 스코어라인 */}
        <motion.div
          className="mt-5 flex items-center gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          <span className="stat-num text-sm font-bold text-dim">{meCode}</span>
          <span className="stat-num display text-5xl" style={{ color: scoreColor }}>
            {scoreMe}
            <span className="px-2 text-dim">:</span>
            {scoreOpp}
          </span>
          <span className="stat-num text-sm font-bold text-dim">{oppCode}</span>
        </motion.div>

        <motion.div
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/50 px-3 py-1"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
        >
          <span className="stat-num text-[13px] font-bold text-accent">{minute}′</span>
          <span className="text-[13px] text-dim">
            {meNameKo} vs {oppNameKo}
          </span>
        </motion.div>

        {/* 감독 정체성 인계 */}
        <motion.h2
          id="handoff-title"
          className="display mt-7 text-balance text-3xl leading-tight text-ink sm:text-4xl"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
        >
          감독님, 지금부터<br />당신의 경기입니다.
        </motion.h2>

        <motion.p
          className="mt-4 max-w-sm text-pretty text-sm leading-relaxed text-dim"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34 }}
        >
          {minute}분, 스코어는 {scoreMe} 대 {scoreOpp}. 남은 시간을 당신의 전술로 다시
          씁니다.
        </motion.p>

        <motion.button
          type="button"
          onClick={onStart}
          className="mt-8 inline-flex items-center gap-2 rounded-control bg-accent px-8 py-3.5 text-base font-black text-accent-ink transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
          autoFocus
        >
          지휘봉 잡기
          <ArrowRight size={18} weight="bold" aria-hidden />
        </motion.button>
      </div>
    </motion.div>
  );
}
