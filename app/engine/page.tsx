"use client";

// /engine — 엔진 성적표. "이 엔진이 실제를 이만큼 맞힌다"를 경기별로 보여주는 신뢰 화면.
// engineScorecard()는 104경기 분석 예측이라 가볍지만, 스피너가 먼저 그려지도록 다음
// 프레임에 계산해 첫 페인트를 막지 않는다. 모션은 등장 리빌만(MOTION 6) — 스크롤에
// 맞춰 헤더·성적표가 한 번 나타나며, prefers-reduced-motion이면 정적으로 떨어진다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "@phosphor-icons/react";
import { engineScorecard, type Scorecard } from "@/lib/wc2026/scorecard";
import { EngineScorecard } from "@/components/result/EngineScorecard";
import { Disclaimer } from "@/components/ui/Disclaimer";

export default function EnginePage() {
  const [sc, setSc] = useState<Scorecard | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const id = requestAnimationFrame(() => setSc(engineScorecard()));
    return () => cancelAnimationFrame(id);
  }, []);

  const enter = reduce
    ? { initial: false as const }
    : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } };
  const reveal = reduce
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 26 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.2 },
        transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
      };

  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 scroll-mt-14 flex-col gap-6 px-5 py-10 sm:py-14">
      <motion.header {...enter}>
        <Link href="/" className="text-xs text-dim transition-colors hover:text-ink">
          ← 처음으로
        </Link>
        <p className="eyebrow mt-5 text-accent">신뢰 근거</p>
        <h1 className="display mt-2 text-balance text-4xl leading-[1.05] text-ink sm:text-5xl">
          이 엔진은 현실을<br />얼마나 맞힐까
        </h1>
        <p className="mt-4 max-w-prose text-pretty text-sm leading-relaxed text-dim sm:text-base">
          &ldquo;다시 쓰기&rdquo;가 <b className="text-ink">근거 있는 만약</b>이 되려면, 엔진이 현실을 얼마나
          재현하는지 눈으로 확인돼야 합니다. 아래는 실제 2026 월드컵에 무개입으로 돌린 성적표입니다.
        </p>
      </motion.header>

      {sc ? (
        <motion.div {...reveal}>
          <EngineScorecard scorecard={sc} />
        </motion.div>
      ) : (
        <div
          role="status"
          aria-live="polite"
          className="panel flex items-center justify-center gap-2 rounded-panel p-12 text-sm text-dim"
        >
          <span aria-hidden className="touchline-spin h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent" />
          104경기 재현을 계산하는 중…
        </div>
      )}

      {/* 신뢰 화면의 페이오프: 그래서, 직접 다시 써보게 만든다(랜딩 CTA). */}
      <motion.div
        {...reveal}
        className="flex flex-col items-start gap-3 rounded-panel border border-accent/30 bg-accent/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-sm leading-relaxed text-dim">
          <b className="text-ink">현실을 따라가는 엔진</b>이 당신의 평행세계를 계산합니다.
        </p>
        <Link
          href="/"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-control bg-accent px-5 py-3 text-sm font-black text-accent-ink transition-transform hover:-translate-y-0.5"
        >
          경기 다시 쓰러 가기
          <ArrowRight size={16} weight="bold" aria-hidden />
        </Link>
      </motion.div>

      <footer className="mt-2">
        <Disclaimer />
      </footer>
    </main>
  );
}
