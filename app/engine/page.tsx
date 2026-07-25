"use client";

// /engine — 엔진 성적표. "이 엔진이 실제를 이만큼 맞힌다"를 경기별로 보여주는 신뢰 화면.
// engineScorecard()는 104경기 분석 예측이라 가볍지만, 스피너가 먼저 그려지도록 다음
// 프레임에 계산해 첫 페인트를 막지 않는다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { engineScorecard, type Scorecard } from "@/lib/wc2026/scorecard";
import { EngineScorecard } from "@/components/result/EngineScorecard";
import { Disclaimer } from "@/components/ui/Disclaimer";

export default function EnginePage() {
  const [sc, setSc] = useState<Scorecard | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSc(engineScorecard()));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl flex-1 scroll-mt-14 flex-col gap-5 px-5 py-8">
      <header>
        <Link href="/" className="text-xs text-dim transition-colors hover:text-ink">
          ← 처음으로
        </Link>
        <p className="eyebrow mt-4 text-accent">신뢰 근거</p>
        <h1 className="display mt-2 text-balance text-4xl text-ink">엔진 성적표</h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-dim">
          &ldquo;다시 쓰기&rdquo;가 <b className="text-ink">근거 있는 만약</b>이 되려면, 엔진이 현실을
          얼마나 재현하는지 눈으로 확인돼야 합니다. 아래는 실제 2026 월드컵에 무개입으로 돌린
          성적표입니다.
        </p>
      </header>

      {sc ? (
        <EngineScorecard scorecard={sc} />
      ) : (
        <div className="panel flex items-center justify-center gap-2 rounded-panel p-12 text-sm text-dim">
          <span className="touchline-spin h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent" />
          104경기 재현을 계산하는 중…
        </div>
      )}

      <footer className="mt-4">
        <Disclaimer />
      </footer>
    </main>
  );
}
