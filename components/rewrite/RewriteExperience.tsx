"use client";

// 2026 월드컵 다시 쓰기 본체. 이 앱의 메인 경험이라 홈(/)과 /rewrite 두 라우트가
// 모두 이 컴포넌트를 렌더한다. 딥링크(/rewrite?match=)는 여전히 /rewrite로 들어오고,
// 홈에서 진입한 사용자는 /에서 같은 경험을 본다.
//
// 선택한 경기/사이드는 ?match=&side= 쿼리에 산다(라운드/조 필터는 MatchBrowser가
// 같은 URL의 ?round=&group=을 소유한다). URL 하나로 라운드 탭, 조 칩, 선택된 경기,
// 선택된 사이드, 순간 카드까지 전부 복원되고 뒤로/앞으로가기가 된다.
// useSearchParams()는 정적 내보내기 프리렌더 시 Suspense 경계가 필요하므로,
// 이 컴포넌트를 쓰는 라우트는 <Suspense>로 감싼다.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { wc2026Matches } from "@/lib/wc2026/data";
import type { Wc2026Match } from "@/lib/wc2026/types";
import { MatchBrowser } from "@/components/rewrite/MatchBrowser";
import { MatchDetail } from "@/components/rewrite/MatchDetail";
import { HowItWorks } from "@/components/rewrite/HowItWorks";
import { HighlightGallery } from "@/components/rewrite/HighlightGallery";
import { Disclaimer } from "@/components/ui/Disclaimer";

interface RewriteExperienceProps {
  /** 홈(/)에서는 자기 자신으로 가는 "처음으로" 링크가 무의미하므로 숨긴다. */
  showBackLink?: boolean;
}

export function RewriteExperience({ showBackLink = false }: RewriteExperienceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const matches = wc2026Matches();
  const reduce = useReducedMotion();

  // 히어로 등장: 아이브로 -> 헤드라인 -> 설명 -> 3단계 순으로 한 번만 올라온다.
  // 모션의 역할은 위계 전달(먼저 읽을 것부터 도착) — 장식용 루프는 두지 않는다.
  // prefers-reduced-motion이면 전부 정적으로 즉시 표시된다.
  const rise = (delay: number) =>
    reduce
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  const matchId = searchParams.get("match") ?? undefined;
  const selectedMatch = matchId ? matches.find((m) => m.id === matchId) : undefined;
  const selectedSide = selectedMatch ? (searchParams.get("side") ?? undefined) : undefined;

  function updateQuery(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const handleSelectMatch = (match: Wc2026Match) => {
    updateQuery({ match: match.id, side: undefined });
  };

  const resetSelection = () => {
    updateQuery({ match: undefined, side: undefined });
  };

  return (
    <main id="main" className="flex flex-1 scroll-mt-14 flex-col pb-12">
      {/* ── 히어로 ───────────────────────────────────────── */}
      <section
        aria-label="히어로"
        className="pitch-stripes relative overflow-hidden border-b border-line"
      >
        {/* PC에서는 제목과 설명을 가로로 나눠 히어로 높이를 줄인다. 세로로 쌓으면
            경기 브라우저가 화면 밖으로 밀려 "본론이 안 보이는" 첫인상이 된다. */}
        <div className="mx-auto w-full max-w-6xl px-5 pb-6 pt-6 sm:pt-8">
          {showBackLink && (
            <Link href="/" className="text-xs text-dim transition-colors hover:text-ink">
              ← 처음으로
            </Link>
          )}
          <div
            className={`grid grid-cols-1 gap-x-10 gap-y-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end ${
              showBackLink ? "mt-3" : ""
            }`}
          >
            <div>
              <motion.p {...rise(0)} className="eyebrow text-accent">
                2026 월드컵 다시 쓰기
              </motion.p>
              <motion.h1
                {...rise(0.08)}
                className="display mt-2 text-balance text-4xl text-ink sm:text-5xl"
              >
                그 순간,<br />감독이었다면.
              </motion.h1>
            </div>
            <motion.p
              {...rise(0.16)}
              className="max-w-xl text-pretty text-sm leading-relaxed text-dim sm:text-base lg:pb-1"
            >
              실제 2026 월드컵 경기에서 승부를 가른 결정적 순간을 골라, 그 시점부터
              직접 전술을 지휘해 결과를 바꿔보세요.
            </motion.p>
          </div>

          {/* 이렇게 진행돼요(3단계) + 검증 근거 — 첫 화면 이해도. */}
          <motion.div {...rise(0.24)} className="mt-6">
            <HowItWorks />
          </motion.div>
        </div>
      </section>

      {/* ── 명장면(바로 시작) ──────────────────────────────
          104경기 목록보다 먼저 놓는다: 처음 온 사람이 고르는 부담 없이 가장 극적인
          순간으로 곧장 들어갈 수 있어야 한다. 목록은 그다음 선택지다. */}
      <section aria-label="명장면" className="mx-auto w-full max-w-6xl px-5 pt-9">
        <HighlightGallery />
      </section>

      {/* ── 마스터-디테일 ─────────────────────────────────
          좌: 경기 행 리스트(넓게) / 우: 선택한 경기 상세(좁게, lg 이상 sticky).
          lg 미만에서는 우측 컬럼을 숨기고 상세를 선택된 행 아래에 인라인으로 편다
          (같은 MatchDetail을 쓰되 둘 중 하나는 항상 display:none). */}
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-5 pt-9 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <section aria-label="경기 선택" className="min-w-0">
          <header className="accent-tab mb-5 pl-4">
            <h2 className="display text-balance text-2xl text-ink sm:text-3xl">
              어느 경기를 다시 쓸까
            </h2>
            <p className="mt-1.5 text-[13px] text-dim">
              다시 쓰고 싶은 경기를 눌러, 지휘할 팀과 지휘봉을 잡을 순간을 고르세요.
            </p>
          </header>
          <MatchBrowser
            matches={matches}
            selectedMatchId={selectedMatch?.id}
            onSelectMatch={handleSelectMatch}
            renderInlineDetail={(m) => (
              <MatchDetail
                match={m}
                side={selectedSide}
                onSelectSide={(side) => updateQuery({ side })}
                onReset={resetSelection}
              />
            )}
          />
        </section>

        {/* 우측 상세 컬럼(lg 이상에서만). 라벨은 MatchDetail이 직접 들고 있다. */}
        <div className="hidden min-w-0 lg:sticky lg:top-[4.5rem] lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1">
          <MatchDetail
            match={selectedMatch}
            side={selectedSide}
            onSelectSide={(side) => updateQuery({ side })}
            onReset={resetSelection}
            aside
          />
        </div>
      </div>

      {/* ── 하단 고지 ────────────────────────────────────── */}
      <footer className="mx-auto mt-16 w-full max-w-6xl px-5 pb-4">
        <Disclaimer />
      </footer>
    </main>
  );
}
