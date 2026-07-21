"use client";

// 복기(rewrite) 모드 비교: "실제 역사" vs "당신의 평행세계"를 나란히 보여주고,
// 결과가 바뀌었는지 한 문장(deltaKo)으로 요약한다. free 모드의 CfCompare(무개입
// 시뮬레이션과 비교)와 시각 언어를 맞추되, rewrite 모드에서는 비교 대상이
// "실제 역사"라는 점이 다르다. 유리(결과 개선)=초록, 불리(결과 악화)=빨강,
// 동일=중립.

import { SoccerBall, ClockCounterClockwise, SealCheck, Trophy, ArrowUUpLeft } from "@phosphor-icons/react";
import type { RewriteCompare, ResultWord } from "./compare";
import { resultRank } from "./compare";
import type { GoalTimeline, RealGoal } from "./goal-timeline";
import { ENGINE_VALIDATION } from "@/lib/wc2026/validation";

interface RealVsParallelProps {
  compare: RewriteCompare;
  meCode: string;
  oppCode: string;
  // 인수 시점 이후 구간의 골 타임라인 대조. rewriteContext가 없거나 실제 경기를
  // 찾지 못한 경우를 대비해 선택 값으로 둔다(없으면 스코어 비교만 보여준다).
  timeline?: GoalTimeline;
}

// 실제 골 목록은 최대 5개까지만 나열하고 나머지는 개수로 요약한다.
const MAX_LISTED_GOALS = 5;

interface ListedGoal extends RealGoal {
  conceded: boolean;
}

function mergeRealGoals(timeline: GoalTimeline): ListedGoal[] {
  return [
    ...timeline.realScored.map((g) => ({ ...g, conceded: false })),
    ...timeline.realConceded.map((g) => ({ ...g, conceded: true })),
  ].sort((a, b) => a.minute - b.minute);
}

function wordColor(word: ResultWord): string {
  if (word === "승리") return "var(--color-gain)";
  if (word === "무승부") return "var(--color-dim)";
  return "var(--color-danger)";
}

function ScoreCard({
  label,
  meCode,
  oppCode,
  scoreFor,
  scoreAgainst,
  word,
  highlight,
}: {
  label: string;
  meCode: string;
  oppCode: string;
  scoreFor: number;
  scoreAgainst: number;
  word: ResultWord;
  highlight: boolean;
}) {
  return (
    <div
      className={`flex flex-1 flex-col items-center rounded-panel border px-3 py-4 ${
        highlight ? "border-accent/60 bg-accent/10" : "border-line bg-surface-2/40"
      }`}
    >
      <p className="eyebrow text-center text-dim">{label}</p>
      <div className="mt-2 flex items-center gap-1.5 text-[13px] font-bold text-dim">
        <span>{meCode}</span>
        <span className="stat-num display text-3xl text-ink">
          {scoreFor}
          <span className="px-1 text-dim">:</span>
          {scoreAgainst}
        </span>
        <span>{oppCode}</span>
      </div>
      <span className="stat-num mt-2 text-xs font-black" style={{ color: wordColor(word) }}>
        {word}
      </span>
    </div>
  );
}

// 인수 시점 이후 구간의 대조를 기존 카드 안에 문장으로 덧붙인다. 별도 섹션을 만들지
// 않는 이유: 이 분석은 위 스코어 비교의 근거(어느 시간대에서 무엇이 달라졌는가)이지
// 독립된 주제가 아니다.
function TimelineNote({ timeline }: { timeline: GoalTimeline }) {
  const listed = mergeRealGoals(timeline);
  const shown = listed.slice(0, MAX_LISTED_GOALS);
  const hidden = listed.length - shown.length;

  return (
    <div className="mt-3 rounded-panel border border-line bg-surface-2/40 px-3.5 py-3">
      <p className="eyebrow flex items-center gap-1.5 text-dim">
        <ClockCounterClockwise size={13} weight="bold" aria-hidden />
        <span>
          <span className="tnum">{timeline.fromMinute}</span>분 이후 구간 대조
        </span>
      </p>

      <ul className="mt-2 flex flex-col gap-1.5">
        {timeline.linesKo.map((line) => (
          <li key={line} className="text-[13px] leading-relaxed text-ink">
            {line}
          </li>
        ))}
      </ul>

      {listed.length > 0 && (
        <>
          <p className="mt-3 text-[13px] text-dim">이 구간의 실제 골 기록</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {shown.map((g) => (
              <li
                key={`${g.minute}-${g.playerName}-${g.conceded ? "a" : "f"}`}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px]"
                style={{
                  borderColor: g.conceded ? "var(--color-danger)" : "var(--color-gain)",
                  color: g.conceded ? "var(--color-danger)" : "var(--color-gain)",
                }}
              >
                <SoccerBall size={11} weight="bold" aria-hidden />
                <span className="tnum font-bold">{g.minute}&apos;</span>
                <span className="text-ink">{g.playerName}</span>
                {g.ownGoal && <span className="text-dim">자책</span>}
              </li>
            ))}
            {hidden > 0 && (
              <li className="rounded-full border border-line px-2 py-0.5 text-[13px] text-dim">
                외 <span className="tnum">{hidden}</span>골
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

export function RealVsParallel({ compare, meCode, oppCode, timeline }: RealVsParallelProps) {
  const realWord = compare.realResultKo;
  const myWord = compare.myResultKo;
  const realFor = compare.realFor;
  const realAgainst = compare.realAgainst;
  const myFor = compare.myFor;
  const myAgainst = compare.myAgainst;

  const improved = compare.changedOutcome && resultRank(myWord) > resultRank(realWord);
  const worsened = compare.changedOutcome && resultRank(myWord) < resultRank(realWord);
  const deltaColor = !compare.changedOutcome
    ? "var(--color-dim)"
    : improved
      ? "var(--color-gain)"
      : "var(--color-danger)";

  return (
    <section className="panel rounded-panel p-4">
      <div className="flex items-center justify-between">
        <p className="eyebrow text-accent">실제 역사 vs 평행세계</p>
        <span className="text-[13px] text-dim">당신이 지휘봉을 잡았다면?</span>
      </div>

      {/* 결과 판정 도장: 감독의 개입이 실제 역사를 뒤집었는지가 이 앱의 페이오프다.
          개선(역사 변경)=트로피·초록, 악화=되감기·빨강. 동률이면 도장 없이
          아래 deltaKo 문장으로만 알린다(과장 방지). */}
      {improved && (
        <div className="mt-3 flex items-center gap-2 rounded-panel border border-gain/50 bg-gain/12 px-3.5 py-2.5">
          <Trophy size={20} weight="fill" aria-hidden className="shrink-0 text-gain" />
          <p className="text-sm font-black text-gain">역사를 다시 썼습니다</p>
        </div>
      )}
      {worsened && (
        <div className="mt-3 flex items-center gap-2 rounded-panel border border-danger/40 bg-danger/10 px-3.5 py-2.5">
          <ArrowUUpLeft size={20} weight="bold" aria-hidden className="shrink-0 text-danger" />
          <p className="text-sm font-black text-danger">이번엔 역사를 넘지 못했습니다</p>
        </div>
      )}

      <div className="mt-3 flex items-stretch gap-3">
        <ScoreCard
          label="실제 역사"
          meCode={meCode}
          oppCode={oppCode}
          scoreFor={realFor}
          scoreAgainst={realAgainst}
          word={realWord}
          highlight={false}
        />
        <div className="flex items-center">
          <span className="text-lg text-dim" aria-hidden>
            vs
          </span>
        </div>
        <ScoreCard
          label="당신의 평행세계"
          meCode={meCode}
          oppCode={oppCode}
          scoreFor={myFor}
          scoreAgainst={myAgainst}
          word={myWord}
          highlight
        />
      </div>

      <p
        className="stat-num mt-4 rounded-panel bg-surface-2/50 px-3 py-3 text-center text-sm font-black"
        style={{ color: deltaColor }}
      >
        {compare.deltaKo}
      </p>

      {timeline && <TimelineNote timeline={timeline} />}

      {/* 신뢰 근거: 이 비교가 왜 믿을 만한지. "당신이 지휘했다면 바뀐다"는 주장은
          엔진이 현실을 재현할 때만 의미가 있으므로, 그 재현율을 여기서 밝힌다. */}
      <div className="mt-3 flex items-start gap-2 rounded-panel border border-line bg-surface-2/40 px-3.5 py-3">
        <SealCheck size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <p className="text-[13px] leading-relaxed text-dim">
          이 엔진을 실제 2026 월드컵{" "}
          <span className="tnum text-ink">{ENGINE_VALIDATION.matches}</span>경기에 무개입으로 돌리면
          승부가 갈린 경기의 승자를{" "}
          <span className="tnum font-bold text-accent">{ENGINE_VALIDATION.decisiveWinRatePct}%</span>{" "}
          재현합니다. 그만큼 현실을 따라가는 모델이 위 평행세계를 계산했습니다.
        </p>
      </div>
    </section>
  );
}
