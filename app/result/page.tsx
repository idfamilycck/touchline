"use client";

// 복기(result) 화면 — 종료된 경기에서만 진입.
// 결론 한 문장(카운터팩추얼 히어로) → 평행세계 비교 → 승률 타임라인 → 전술 평가 →
// 경기 요약(스탯 시트) → 공유 카드 → 다시 도전 / 새 매치업.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { TrendUp, TrendDown, Target, type Icon } from "@phosphor-icons/react";
import { useAppStore } from "@/lib/store";
import { counterfactual } from "@/lib/engine/counterfactual";
import { teamById } from "@/lib/data/teams";
import { venueById } from "@/lib/data/venues";
import { h2hOf } from "@/lib/data/h2h";
import { applyModifiers } from "@/lib/engine/modifiers";
import { CfCompare } from "@/components/result/CfCompare";
import { FinalTimeline } from "@/components/result/FinalTimeline";
import { ShareCard } from "@/components/result/ShareCard";
import { MatchSummary } from "@/components/result/MatchSummary";
import { heroLine } from "@/components/result/cf-labels";
import { buildTacticsReview } from "@/components/result/tactics-review";
import { TacticsReviewPanel } from "@/components/result/TacticsReviewPanel";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { RealVsParallel } from "@/components/rewrite/RealVsParallel";
import { buildCompare, resultRank } from "@/components/rewrite/compare";
import { buildGoalTimeline } from "@/components/rewrite/goal-timeline";
import { wc2026MatchById } from "@/lib/wc2026/data";

const HERO_TONE: Record<"gain" | "danger" | "neutral", { color: string; bg: string; Icon: Icon }> = {
  gain: { color: "var(--color-gain)", bg: "rgba(59,227,138,0.12)", Icon: TrendUp },
  danger: { color: "var(--color-danger)", bg: "rgba(255,92,122,0.12)", Icon: TrendDown },
  neutral: { color: "var(--color-ink)", bg: "rgba(34,211,238,0.10)", Icon: Target },
};

export default function ResultPage() {
  const router = useRouter();
  const match = useAppStore((s) => s.match);
  const shootout = useAppStore((s) => s.shootout);
  const rematch = useAppStore((s) => s.rematch);
  const reset = useAppStore((s) => s.reset);
  const mode = useAppStore((s) => s.mode);
  const rewriteContext = useAppStore((s) => s.rewriteContext);

  const [hydrated, setHydrated] = useState(false);
  // CTA(다시 도전/새 매치업)는 의도적으로 match를 비우고 다른 경로로 이동한다.
  // 이때 아래 "종료된 경기 없으면 홈으로" 가드가 match 소거를 오인해 "/"로
  // 리다이렉트하며 목적지(/tactics)를 덮어쓰지 않도록 플래그로 가드를 끈다.
  const leavingRef = useRef(false);

  useEffect(() => {
    const p = useAppStore.persist;
    if (!p || p.hasHydrated()) {
      // zustand persist(sessionStorage) 재수화 여부를 확인하는 외부 시스템 동기화라 setState가 맞다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHydrated(true);
      return;
    }
    return p.onFinishHydration(() => setHydrated(true));
  }, []);

  const finished = Boolean(match?.finished);
  useEffect(() => {
    if (hydrated && !finished && !leavingRef.current) router.replace("/");
  }, [hydrated, finished, router]);

  // 카운터팩추얼은 결정적·즉시이지만 재렌더마다 재계산할 이유가 없어 메모이즈한다.
  // free 모드 전용 개념(무개입 재시뮬레이션과 비교)이라 rewrite 모드에서도 계산은
  // 되지만(가드용) 화면에는 노출하지 않는다 — rewrite에서는 아래 rewriteCompare가
  // "평행세계"의 실제 의미(실제 역사 vs 나의 개입)를 대신한다.
  const cf = useMemo(() => (match ? counterfactual(match) : null), [match]);

  // rewrite 모드 전용: 실제 역사(Wc2026Match, 정규시간 90분 기준) vs 내가 인수해
  // 시뮬레이션한 결과를 비교한다. mode==="rewrite" && rewriteContext가 모두 있어야
  // 의미가 있으므로, 둘 중 하나라도 없으면(예: 잘못된 matchId) null로 폴백해
  // 아래에서 free 모드 CfCompare로 안전하게 대체한다.
  const rewriteCompare = useMemo(() => {
    if (mode !== "rewrite" || !rewriteContext || !match) return null;
    const realMatch = wc2026MatchById(rewriteContext.matchId);
    if (!realMatch) return null;
    return buildCompare(
      realMatch,
      rewriteContext.side,
      { scoreMe: match.scoreMe, scoreOpp: match.scoreOpp },
      rewriteContext.endMinute ?? 90
    );
  }, [mode, rewriteContext, match]);

  // rewrite 모드 전용: 인수 시점 이후 구간에서 실제 골 타임라인과 내 시뮬의 골을
  // 대조한다. rewriteCompare와 같은 가드 조건이지만, 스코어 비교와 달리 여기서는
  // takeoverMinute(개입 가능 시작 시점)이 반드시 필요하다.
  const goalTimeline = useMemo(() => {
    if (mode !== "rewrite" || !rewriteContext || !match) return undefined;
    const realMatch = wc2026MatchById(rewriteContext.matchId);
    if (!realMatch) return undefined;
    return buildGoalTimeline(
      realMatch,
      rewriteContext.side,
      match.events,
      rewriteContext.takeoverMinute,
      rewriteContext.endMinute ?? 90
    );
  }, [mode, rewriteContext, match]);

  // 전술 평가: 최종(개입 반영) 세팅 기준 발동 규칙 + 경기 이벤트로 코멘트 생성.
  const review = useMemo(() => {
    if (!match) return null;
    const venue = venueById(match.venueId);
    const meTeam = teamById(match.me.teamId);
    const oppTeam = teamById(match.opp.teamId);
    if (!venue || !meTeam || !oppTeam) return null;
    const meMod = applyModifiers(match.me, match.opp, venue, meTeam, oppTeam, h2hOf(match.me.teamId, match.opp.teamId));
    const oppMod = applyModifiers(match.opp, match.me, venue, oppTeam, meTeam, h2hOf(match.opp.teamId, match.me.teamId));
    return buildTacticsReview(match, meMod, oppMod);
  }, [match]);

  if (!hydrated || !match || !cf) {
    return (
      <main id="main" className="flex flex-1 scroll-mt-14 items-center justify-center px-5 py-24 text-center">
        <p className="text-sm text-dim">
          {hydrated && !match ? "홈으로 이동합니다…" : "복기를 준비하는 중…"}
        </p>
      </main>
    );
  }

  const me = teamById(match.me.teamId);
  const opp = teamById(match.opp.teamId);

  const drawn = match.scoreMe === match.scoreOpp;
  const overallWord = shootout
    ? shootout.winner === "me"
      ? "승부차기 승리"
      : "승부차기 패배"
    : match.scoreMe > match.scoreOpp
      ? "승리"
      : drawn
        ? "무승부"
        : "패배";
  const wordColor = overallWord.includes("승리")
    ? "var(--color-gain)"
    : overallWord === "무승부"
      ? "var(--color-dim)"
      : "var(--color-danger)";

  const shootoutMe = shootout ? shootout.rounds.filter((r) => r.side === "me" && r.scored).length : 0;
  const shootoutOpp = shootout ? shootout.rounds.filter((r) => r.side === "opp" && r.scored).length : 0;

  // rewrite 모드면 히어로 결론 문장을 "실제 역사 vs 나의 개입" 델타(deltaKo)로 대체한다.
  // free 모드의 heroLine(cf.deltas)은 "무개입 재시뮬레이션과 비교"라는 다른 개념이라
  // rewrite에는 맞지 않는다.
  const hero = rewriteCompare
    ? {
        text: rewriteCompare.deltaKo,
        tone: !rewriteCompare.changedOutcome
          ? ("neutral" as const)
          : resultRank(rewriteCompare.myResultKo) > resultRank(rewriteCompare.realResultKo)
            ? ("gain" as const)
            : ("danger" as const),
      }
    : heroLine(cf.deltas);
  const tone = HERO_TONE[hero.tone];

  // 스탯 집계는 lib/engine/match-stats.ts가 단일 소스다(MatchSummary가 직접 읽는다).

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 scroll-mt-14 flex-col gap-4 px-4 py-6 sm:px-5">
      {/* 헤드라인 */}
      <header className="panel rounded-panel px-4 py-5 text-center">
        <h1 className="eyebrow text-balance text-accent">경기 복기</h1>
        <div className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-dim">
          <span>{me?.code ?? "ME"}</span>
          <span className="stat-num display text-5xl text-ink">
            {match.scoreMe}<span className="px-2 text-dim">:</span>{match.scoreOpp}
          </span>
          <span>{opp?.code ?? "OPP"}</span>
        </div>
        <p className="mt-2 text-sm text-dim">
          {me?.nameKo ?? "우리"} vs {opp?.nameKo ?? "상대"}
        </p>
        {shootout && (
          <p className="stat-num mt-1 text-[13px] text-dim">
            승부차기 {shootoutMe} : {shootoutOpp}
          </p>
        )}
        <p className="stat-num mt-3 text-lg font-black" style={{ color: wordColor }}>
          {overallWord}
        </p>
      </header>

      {/* 카운터팩추얼 히어로 결론 */}
      <section
        className="rounded-panel border p-5"
        style={{ borderColor: tone.color, background: tone.bg }}
      >
        <p className="eyebrow" style={{ color: tone.color }}>
          결정적 순간
        </p>
        <p className="mt-2 flex items-start gap-2 text-xl font-black leading-snug text-ink">
          <tone.Icon size={22} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
          <span>{hero.text}</span>
        </p>
        <p className="mt-2 text-[13px] text-dim">
          {rewriteCompare
            ? "실제 월드컵 역사의 정규시간 결과와, 당신이 지휘봉을 잡은 뒤의 결과를 비교합니다."
            : "같은 라인업으로 개입 없이 처음부터 다시 돌렸을 때와 비교한 승률 변화입니다."}
        </p>
      </section>

      {/* 평행세계 비교: rewrite 모드는 "실제 역사" vs "나의 개입", free 모드는
          "실제 경기" vs "무개입 재시뮬레이션"이라는 서로 다른 개념이라 컴포넌트를 분기한다. */}
      {rewriteCompare ? (
        <RealVsParallel
          compare={rewriteCompare}
          meCode={me?.code ?? "ME"}
          oppCode={opp?.code ?? "OPP"}
          timeline={goalTimeline}
        />
      ) : (
        <CfCompare cf={cf} match={match} />
      )}

      {/* 승률 타임라인 */}
      <FinalTimeline match={match} />

      {/* 전술 평가 & 보완 */}
      {review && <TacticsReviewPanel review={review} />}

      {/* 경기 요약. 예전에는 접힌 아코디언 안에 네 줄뿐이라 "결과 요약이 없다"는
          인상을 줬다. 펼친 상태로 두고 지표를 늘렸다. */}
      <MatchSummary
        match={match}
        meNameKo={me?.nameKo ?? "우리"}
        oppNameKo={opp?.nameKo ?? "상대"}
      />

      {/* 공유 카드 */}
      <ShareCard match={match} cf={cf} shootout={shootout} />

      {/* CTA */}
      <div className="flex flex-col gap-2 pt-1">
        {mode === "rewrite" ? (
          // rewrite 모드: rematch()는 free 모드용 라인업 리셋 로직이라 mode를 "rewrite"로
          // 남겨둔 채 부적절한 상태를 만든다(알려진 불일치). 대신 다른 실제 경기의
          // "결정적 순간"을 새로 고르러 /rewrite로 보낸다.
          <button
            type="button"
            onClick={() => {
              leavingRef.current = true;
              router.push("/rewrite");
            }}
            className="w-full rounded-control bg-accent py-4 text-base font-black text-accent-ink transition-transform hover:-translate-y-0.5"
          >
            다른 경기 다시 쓰기 →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              leavingRef.current = true;
              rematch();
              router.push("/tactics");
            }}
            className="w-full rounded-control bg-accent py-4 text-base font-black text-accent-ink transition-transform hover:-translate-y-0.5"
          >
            같은 매치업 다시 도전 →
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            leavingRef.current = true;
            reset();
            router.push("/");
          }}
          className="w-full rounded-control border border-line py-3.5 text-sm font-bold text-dim transition-colors hover:border-white/25 hover:text-ink"
        >
          새 매치업 고르기
        </button>
        <Link href="/" className="mt-1 text-center text-[13px] text-dim hover:text-ink">
          홈으로
        </Link>
      </div>

      <footer className="mt-2 w-full">
        <Disclaimer />
      </footer>
    </main>
  );
}
