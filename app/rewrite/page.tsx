"use client";

// /rewrite — 2026 월드컵 다시 쓰기 진입점.
// 실제 2026 경기를 골라(라운드 탭 + KOR 우선 정렬) 관리할 팀을 고르면, 그 팀의
// "결정적 순간" 카드가 열린다. 순간을 고르면 startRewrite()가 그 시점(takeoverMinute)
// 부터의 매치 상태를 만들고 /tactics로 넘어가 실제로 개입한다.

import { useState } from "react";
import Link from "next/link";
import { registerWc2026 } from "@/lib/wc2026/register";
import { wc2026Matches } from "@/lib/wc2026/data";
import type { Wc2026Match } from "@/lib/wc2026/types";
import { MatchBrowser } from "@/components/rewrite/MatchBrowser";
import { MomentCards } from "@/components/rewrite/MomentCards";
import { Disclaimer } from "@/components/ui/Disclaimer";

// 모듈 로드 시 1회 등록(idempotent) — MatchBrowser의 최초 렌더부터 wc 팀 이름을
// 바로 조회할 수 있도록 useEffect보다 먼저 실행되는 이 시점에 호출한다.
registerWc2026();

export default function RewritePage() {
  const matches = wc2026Matches();
  const [selectedMatch, setSelectedMatch] = useState<Wc2026Match>();
  const [selectedSide, setSelectedSide] = useState<string>();

  const handleSelectMatch = (match: Wc2026Match) => {
    setSelectedMatch(match);
    setSelectedSide(undefined);
  };

  const resetSelection = () => {
    setSelectedMatch(undefined);
    setSelectedSide(undefined);
  };

  return (
    <main className="flex flex-1 flex-col pb-12">
      {/* ── 히어로 ───────────────────────────────────────── */}
      <section
        aria-label="히어로"
        className="pitch-stripes relative overflow-hidden border-b border-line"
      >
        <div className="mx-auto w-full max-w-5xl px-5 pb-8 pt-8 sm:pt-12">
          <Link href="/" className="text-xs text-dim transition-colors hover:text-ink">
            ← 처음으로
          </Link>
          <p className="eyebrow mt-4 text-accent">2026 월드컵 다시 쓰기</p>
          <h1 className="display mt-3 text-4xl text-ink sm:text-5xl">
            그 순간,<br />감독이었다면.
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-dim sm:text-base">
            실제 2026 월드컵 경기에서 승부를 가른 결정적 순간을 골라, 그 시점부터
            직접 전술을 지휘해 결과를 바꿔보세요.
          </p>
        </div>
      </section>

      {/* ── 경기 브라우저 ────────────────────────────────── */}
      <section aria-label="경기 선택" className="mx-auto w-full max-w-5xl px-5 pt-12">
        <header className="lime-tab mb-6 pl-4">
          <p className="eyebrow text-dim">STEP 01 · 경기 선택</p>
          <h2 className="display mt-1 text-2xl text-ink sm:text-3xl">어느 경기를 다시 쓸까</h2>
        </header>
        <MatchBrowser
          matches={matches}
          selectedMatchId={selectedMatch?.id}
          selectedSide={selectedSide}
          onSelectMatch={handleSelectMatch}
          onSelectSide={setSelectedSide}
        />
      </section>

      {/* ── 결정적 순간 카드 ─────────────────────────────── */}
      {selectedMatch && selectedSide && (
        <section aria-label="결정적 순간 선택" className="mx-auto w-full max-w-5xl px-5 pt-10">
          <header className="lime-tab mb-6 flex flex-wrap items-center justify-between gap-3 pl-4">
            <div>
              <p className="eyebrow text-dim">STEP 02 · 결정적 순간</p>
              <h2 className="display mt-1 text-2xl text-ink sm:text-3xl">
                어디서부터 다시 쓸까
              </h2>
            </div>
            <button
              type="button"
              onClick={resetSelection}
              className="shrink-0 text-xs text-dim underline transition-colors hover:text-ink"
            >
              다른 경기 고르기
            </button>
          </header>
          <MomentCards match={selectedMatch} side={selectedSide} />
        </section>
      )}

      {/* ── 하단 고지 ────────────────────────────────────── */}
      <footer className="mx-auto mt-16 w-full max-w-5xl px-5 pb-4">
        <Disclaimer />
      </footer>
    </main>
  );
}
