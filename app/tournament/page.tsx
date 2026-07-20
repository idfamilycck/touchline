"use client";

// /tournament — 2026 월드컵을 "경기 목록"이 아니라 "대회"로 보여주는 엔트리.
// 조별리그 순위표(A~L)와 토너먼트 대진표를 실제 103경기 데이터에서 렌더 시점에
// 계산한다(lib/wc2026/standings.ts). 별도 저장 데이터는 없음 — data/wc2026/*.json은
// 손대지 않는다.

import Link from "next/link";
import { registerWc2026 } from "@/lib/wc2026/register";
import { wc2026Matches } from "@/lib/wc2026/data";
import { groupStandings, knockoutBracket } from "@/lib/wc2026/standings";
import { GroupStandings } from "@/components/tournament/GroupStandings";
import { KnockoutBracket } from "@/components/tournament/KnockoutBracket";
import { Disclaimer } from "@/components/ui/Disclaimer";

// 모듈 로드 시 1회 등록(idempotent) — 최초 렌더부터 wc 팀 한글명/색상을 바로
// 조회할 수 있도록 useEffect보다 먼저 실행되는 이 시점에 호출한다(/rewrite와 동일 패턴).
registerWc2026();

export default function TournamentPage() {
  const matches = wc2026Matches();
  const standings = groupStandings(matches);
  const bracket = knockoutBracket(matches);

  return (
    <main id="main" className="flex flex-1 scroll-mt-14 flex-col pb-12">
      {/* ── 히어로 ───────────────────────────────────────── */}
      <section
        aria-label="히어로"
        className="pitch-stripes relative overflow-hidden border-b border-line"
      >
        <div className="mx-auto w-full max-w-6xl px-5 pb-8 pt-8 sm:pt-12">
          <Link href="/" className="text-xs text-dim transition-colors hover:text-ink">
            ← 처음으로
          </Link>
          <p className="eyebrow mt-4 text-accent">2026 월드컵</p>
          <h1 className="display mt-3 text-balance text-4xl text-ink sm:text-5xl">
            대회를,<br />한눈에.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-sm leading-relaxed text-dim sm:text-base">
            실제 2026 월드컵 103경기 데이터로 계산한 조별리그 순위와 토너먼트 대진표입니다.
            경기를 고르면 그 순간부터 직접 다시 지휘할 수 있습니다.
          </p>
        </div>
      </section>

      {/* ── 조별리그 순위 ────────────────────────────────── */}
      <section aria-label="조별리그 순위" className="mx-auto w-full max-w-6xl px-5 pt-12">
        <header className="accent-tab mb-6 pl-4">
          <h2 className="display text-balance text-2xl text-ink sm:text-3xl">조별리그 순위</h2>
        </header>
        <GroupStandings standings={standings} />
      </section>

      {/* ── 토너먼트 대진표 ──────────────────────────────── */}
      <section aria-label="토너먼트 대진표" className="mx-auto w-full max-w-6xl px-5 pt-14">
        <header className="accent-tab mb-6 pl-4">
          <h2 className="display text-balance text-2xl text-ink sm:text-3xl">토너먼트 대진표</h2>
        </header>
        <KnockoutBracket bracket={bracket} />
      </section>

      {/* ── 하단 고지 ────────────────────────────────────── */}
      <footer className="mx-auto mt-16 w-full max-w-6xl px-5 pb-4">
        <Disclaimer />
      </footer>
    </main>
  );
}
