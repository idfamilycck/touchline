// components/tournament/KnockoutBracket.tsx
//
// 토너먼트 대진표: 32강 → 16강 → 8강 → 4강 → 결승을 가로 컬럼으로, 3·4위전은
// 별도 카드로 그린다. 순수 프레젠테이션(계산은 lib/wc2026/standings.ts). 결승
// 데이터가 아직 없으면(final 라운드가 비어 있으면) 빈 대진 대신 안내 placeholder를
// 보여준다. 좁은 화면에서는 이 컴포넌트 자신의 컨테이너 안에서만 가로 스크롤되고,
// 페이지 본문은 가로로 스크롤되지 않는다.
//
// 세로 정렬: 라운드마다 티어 수가 절반씩 줄어든다(32강 16개 → 16강 8개 → … → 결승 1개).
// 부모 행(row)을 items-stretch(기본값)로 두면 모든 라운드 컬럼이 가장 키가 큰 컬럼(32강)의
// 높이로 늘어난다. 그 늘어난 높이 안에서 각 컬럼의 "티어 묶음"에 justify-around를 주면,
// n개 아이템이 동일한 폭(H/n)의 슬롯 중앙에 각각 배치된다 — 이는 정확히 재귀적으로
// "다음 라운드 티어는 자신을 만든 두 티어의 중앙"이 되는 성질과 같다(슬롯 i의 중심
// (i+0.5)·H/n, 다음 라운드에서 이를 두 개씩 평균 내면 그대로 다음 라운드의 슬롯 중심과
// 일치한다). 라운드 라벨(eyebrow)은 이 분배 그룹 밖에 두어 "티어 묶음"만 순수하게 n등분되게
// 한다. JS 측정 없이 CSS만으로 성립하는 이유가 이것이다.

import Link from "next/link";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { teamDisplay } from "@/components/tournament/team-display";
import { roundLabelKo } from "@/components/rewrite/match-browser";
import type { Wc2026Round } from "@/lib/wc2026/types";
import type { BracketMatch } from "@/lib/wc2026/standings";
import { ROUND_LABEL_CLASS, roundTone } from "@/lib/wc2026/stage";
import { Reveal } from "@/components/ui/Reveal";

const MAIN_ROUNDS: Wc2026Round[] = ["r32", "r16", "qf", "sf", "final"];

interface KnockoutBracketProps {
  bracket: Record<Wc2026Round, BracketMatch[]>;
}

export function KnockoutBracket({ bracket }: KnockoutBracketProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto rounded-panel border border-line bg-surface/40 p-4">
        {/* 대진표가 컨테이너보다 좁으면 가운데로 모아 우측 빈 여백을 없앤다. 컨테이너보다
            넓어지면(좁은 화면) min-w-max로 내부 가로 스크롤이 되고 justify는 무력화된다. */}
        <div className="flex min-w-max items-stretch justify-center gap-4">
          {MAIN_ROUNDS.map((round) => {
            const ties = bracket[round] ?? [];
            if (ties.length === 0 && round !== "final") return null;
            return (
              // 라운드 컬럼을 왼쪽부터 차례로 들여보낸다. 32강에서 결승으로 진행하는
              // 대회의 방향과 읽는 방향이 일치한다.
              <Reveal
                key={round}
                index={MAIN_ROUNDS.indexOf(round)}
                step={0.07}
                className="flex w-60 shrink-0 flex-col gap-2.5"
              >
                {/* 라운드가 깊어질수록 라벨이 골드로 진해진다. 대진표를 왼쪽에서
                    오른쪽으로 훑으면 결승을 향해 색이 차오르는 것이 보인다. */}
                <p className={`eyebrow shrink-0 px-1 ${ROUND_LABEL_CLASS[roundTone(round)]}`}>
                  {roundLabelKo(round)}
                </p>
                {/* 이 안쪽 래퍼만 늘어난 컬럼 높이를 실제로 나눠 가진다(라벨은 제외) —
                    라운드마다 available height가 동일해야 위 주석의 재귀적 중앙 정렬
                    수학이 성립한다. */}
                <div className="flex flex-1 flex-col justify-around gap-2.5">
                  {ties.length > 0 ? (
                    ties.map((tie) => <BracketTie key={tie.id} tie={tie} round={round} />)
                  ) : (
                    <div className="panel flex min-h-[88px] items-center justify-center rounded-panel p-4 text-center">
                      <p className="text-xs leading-relaxed text-dim">결승 데이터 준비 중</p>
                    </div>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>

      {(bracket.third ?? []).length > 0 && (
        <div className="flex flex-col gap-2.5">
          <p className={`eyebrow px-1 ${ROUND_LABEL_CLASS[roundTone("third")]}`}>
            {roundLabelKo("third")}
          </p>
          <div className="max-w-xs">
            {bracket.third.map((tie) => (
              <BracketTie key={tie.id} tie={tie} round="third" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BracketTie({ tie, round }: { tie: BracketMatch; round: string }) {
  const home = teamDisplay(tie.home);
  const away = teamDisplay(tie.away);
  const hasPens = tie.penHome !== undefined && tie.penAway !== undefined;
  // 결승의 승자 = 우승팀. 대회 전체에서 골드를 가장 강하게 쓰는 단 한 곳이다.
  const isFinal = round === "final";

  return (
    <Link
      href={`/rewrite?match=${tie.id}`}
      className={`flex flex-col gap-1.5 rounded-panel p-2.5 transition-colors duration-150 ${
        isFinal
          ? "border border-gold/40 bg-gold/5 hover:border-gold/70"
          : "panel hover:border-white/25"
      }`}
    >
      <TieRow
        code={tie.home}
        name={home.nameKo}
        color1={home.color1}
        color2={home.color2}
        score={tie.scoreHome}
        isWinner={tie.winner === tie.home}
        isChampion={isFinal && tie.winner === tie.home}
      />
      <TieRow
        code={tie.away}
        name={away.nameKo}
        color1={away.color1}
        color2={away.color2}
        score={tie.scoreAway}
        isWinner={tie.winner === tie.away}
        isChampion={isFinal && tie.winner === tie.away}
      />
      {hasPens && (
        <p className="tnum pt-0.5 text-center text-[13px] font-bold text-dim">
          (승부차기 {tie.penHome}-{tie.penAway})
        </p>
      )}
    </Link>
  );
}

function TieRow({
  code,
  name,
  color1,
  color2,
  score,
  isWinner,
  isChampion,
}: {
  code: string;
  name: string;
  color1: string;
  color2: string;
  score: number;
  isWinner: boolean;
  isChampion: boolean;
}) {
  // 승자 강조는 중립 표면 + 굵기로 한다. 시안은 이 앱에서 "누를 수 있는 것"을 뜻하므로
  // 결과 표시에 쓰면 의미가 흐려진다. 골드는 우승팀 한 줄에만 허용한다.
  const bg = isChampion
    ? "rgba(245, 197, 99, 0.16)"
    : isWinner
      ? "rgba(255, 255, 255, 0.06)"
      : undefined;

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-control px-1.5 py-1"
      style={{ background: bg }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <FlagBadge code={code} color1={color1} color2={color2} size={20} />
        <span
          className={`relative truncate text-xs ${
            isChampion ? "font-black text-gold" : isWinner ? "font-black text-ink" : "text-dim"
          }`}
        >
          {name}
          {/* relative 부모 안에 가둬 sr-only(absolute)가 가로 스크롤 컨테이너 밖으로
              튀어나가 문서 전체의 가로 스크롤을 유발하지 않도록 한다. */}
          {isChampion ? (
            <span className="sr-only"> (우승)</span>
          ) : isWinner ? (
            <span className="sr-only"> (승)</span>
          ) : null}
        </span>
      </div>
      <span
        className={`stat-num shrink-0 text-sm ${
          isChampion ? "text-gold" : isWinner ? "text-ink" : "text-dim"
        }`}
      >
        {score}
      </span>
    </div>
  );
}
