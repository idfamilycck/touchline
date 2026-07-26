"use client";

// /tournament — 2026 월드컵을 "경기 목록"이 아니라 "대회"로 보여주는 엔트리.
// 조별리그 순위표(A~L)와 토너먼트 대진표를 실제 104경기 데이터에서 렌더 시점에
// 계산한다(lib/wc2026/standings.ts). 별도 저장 데이터는 없음 — data/wc2026/*.json은
// 손대지 않는다.
//
// 골격(2026-07 개편):
//   히어로 → [대한민국 요약 고정] → [탭: 조별리그 | 토너먼트] → 한 번에 한 뷰
// 예전에는 12개 조 순위표 + 5개 라운드 대진표가 한 페이지에 세로로 이어져 스크롤이
// 끝없이 길고 위계가 없었다. 둘을 탭으로 갈라 페이지 길이를 절반으로 줄이고, 그 위에
// "한국이 어느 조에서 어떻게 됐나"를 고정 배치해 첫 화면에서 답이 나오게 한다.

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { registerWc2026 } from "@/lib/wc2026/register";
import { wc2026Matches } from "@/lib/wc2026/data";
import { groupStandings, knockoutBracket } from "@/lib/wc2026/standings";
import { korSummary } from "@/lib/wc2026/kor-summary";
import { GroupStandings } from "@/components/tournament/GroupStandings";
import { KnockoutBracket } from "@/components/tournament/KnockoutBracket";
import {
  TournamentTabs,
  panelId,
  tabId,
  type TournamentView,
} from "@/components/tournament/TournamentTabs";
import { KoreaSummary } from "@/components/tournament/KoreaSummary";
import { Disclaimer } from "@/components/ui/Disclaimer";

// 모듈 로드 시 1회 등록(idempotent) — 최초 렌더부터 wc 팀 한글명/색상을 바로
// 조회할 수 있도록 useEffect보다 먼저 실행되는 이 시점에 호출한다(/rewrite와 동일 패턴).
registerWc2026();

function parseView(v: string | null): TournamentView {
  return v === "knockout" ? "knockout" : "group";
}

// 선택된 뷰는 ?view=group|knockout 쿼리에 산다 — 딥링크로 바로 대진표를 열 수 있고,
// 알 수 없는 값이나 누락은 조별리그로 폴백한다.
// /rewrite는 필터 변경에 router.replace를 쓰지만 여기서는 push를 쓴다: 탭 전환은
// 필터 미세조정이 아니라 "다른 화면으로 이동"이라 뒤로가기로 되돌아올 수 있어야 한다.
// useSearchParams()는 정적 내보내기 프리렌더 시 Suspense 경계가 필요해 본문을
// TournamentContent로 분리하고 기본 export에서 <Suspense>로 감싼다.
function TournamentContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const matches = wc2026Matches();
  const standings = groupStandings(matches);
  const bracket = knockoutBracket(matches);
  const kor = korSummary(matches, standings);

  const view = parseView(searchParams.get("view"));

  function selectView(next: TournamentView) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <main
      id="main"
      className="flex flex-1 scroll-mt-14 flex-col pb-12 lg:h-[calc(100dvh-3.5rem)] lg:flex-none lg:overflow-hidden lg:pb-0"
    >
      {/* ── 히어로 ───────────────────────────────────────── */}
      <section
        aria-label="히어로"
        className="pitch-stripes relative overflow-hidden border-b border-line lg:shrink-0"
      >
        {/* /rewrite와 같은 이유로 PC에서는 가로 2단(제목 | 설명). */}
        <div className="mx-auto w-full max-w-6xl px-5 pb-6 pt-6 sm:pt-8 lg:pb-4 lg:pt-5">
          <Link href="/" className="text-xs text-dim transition-colors hover:text-ink">
            ← 처음으로
          </Link>
          <div className="mt-3 grid grid-cols-1 gap-x-10 gap-y-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
            <div>
              <p className="eyebrow text-accent">2026 월드컵</p>
              <h1 className="display mt-2 text-balance text-4xl text-ink sm:text-5xl">
                대회를,<br />한눈에.
              </h1>
            </div>
            <p className="max-w-xl text-pretty text-sm leading-relaxed text-dim sm:text-base lg:pb-1">
              실제 2026 월드컵 104경기 데이터로 계산한 조별리그 순위와 토너먼트 대진표입니다.
              경기를 고르면 그 순간부터 직접 다시 지휘할 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      {/* ── 대한민국 요약(최상단 고정) ───────────────────── */}
      {kor && (
        <section aria-label="대한민국 요약" className="mx-auto w-full max-w-6xl px-5 pt-6 lg:shrink-0 lg:pt-4">
          <KoreaSummary summary={kor} />
        </section>
      )}

      {/* ── 뷰 전환 탭 ───────────────────────────────────── */}
      {/* 헤더(h-14) 바로 아래에 붙어 따라온다. 어느 뷰를 보고 있는지, 다른 뷰로 어떻게
          가는지가 긴 표를 스크롤하는 동안에도 화면에서 사라지지 않는다. */}
      <div className="sticky top-14 z-20 mt-6 border-y border-line bg-pitch/90 backdrop-blur-md lg:mt-4 lg:shrink-0">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <TournamentTabs view={view} onSelect={selectView} />
          <p className="hidden shrink-0 text-[13px] text-dim sm:block">
            {view === "group" ? "12개 조 · 72경기" : "32강부터 결승까지"}
          </p>
        </div>
      </div>

      {/* ── 뷰 본문 ──────────────────────────────────────────
          lg에서는 이 영역만 세로(순위표)·가로(대진표) 내부 스크롤한다. */}
      <div className="mx-auto w-full max-w-6xl px-5 pt-7 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-6">
        {/* 접근성 이름은 aria-labelledby(탭 버튼)가 가져간다. aria-label을 함께 다는 것은
            e2e/capture-docs.spec.ts가 [aria-label="토너먼트 대진표"] 셀렉터로 대진표
            영역을 잡아 문서용 캡처를 뜨기 때문이다(개편 전 섹션 라벨을 그대로 보존). */}
        {view === "group" ? (
          <div
            id={panelId("group")}
            role="tabpanel"
            aria-labelledby={tabId("group")}
            aria-label="조별리그 순위"
          >
            <GroupStandings standings={standings} featuredGroup={kor?.group} />
          </div>
        ) : (
          <div
            id={panelId("knockout")}
            role="tabpanel"
            aria-labelledby={tabId("knockout")}
            aria-label="토너먼트 대진표"
          >
            <KnockoutBracket bracket={bracket} />
          </div>
        )}
      </div>

      {/* ── 하단 고지(모바일 전용; lg는 한 화면 고정이라 숨긴다) ─── */}
      <footer className="mx-auto mt-16 w-full max-w-6xl px-5 pb-4 lg:hidden">
        <Disclaimer />
      </footer>
    </main>
  );
}

export default function TournamentPage() {
  return (
    <Suspense
      fallback={
        <main
          id="main"
          className="flex flex-1 scroll-mt-14 items-center justify-center px-5 py-24 text-center"
        >
          <p className="text-sm text-dim">불러오는 중...</p>
        </main>
      }
    >
      <TournamentContent />
    </Suspense>
  );
}
