"use client";

// 마스터-디테일에서 "디테일" 쪽. 왼쪽 행 리스트에서 고른 경기 하나를 받아
//  1) 스코어카드(양 팀 국기·이름·득점)
//  2) 어느 팀을 맡을지 고르는 버튼
//  3) 팀을 고른 뒤의 결정적 순간 카드(MomentCards)
// 를 한 흐름으로 세로로 쌓는다.
//
// 렌더 위치는 두 곳이다(같은 컴포넌트, 같은 props):
//  - lg 이상: 우측 sticky 컬럼
//  - lg 미만: 선택된 행 바로 아래 인라인
// 둘 중 하나는 항상 display:none이라 접근성 트리에는 한 번만 올라간다.

import { CursorClick } from "@phosphor-icons/react";
import type { Wc2026Match } from "@/lib/wc2026/types";
import { teamDisplay } from "@/components/tournament/team-display";
import { roundLabelKo } from "@/components/rewrite/match-browser";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { ROUND_LABEL_CLASS, roundTone } from "@/lib/wc2026/stage";
import { MomentCards } from "@/components/rewrite/MomentCards";

interface MatchDetailProps {
  match?: Wc2026Match;
  side?: string;
  onSelectSide: (side: string) => void;
  onReset: () => void;
  /** 우측 컬럼(true)인지 목록 인라인(false)인지 — 빈 상태 안내 문구가 달라진다. */
  aside?: boolean;
}

// "2026-06-12T..." → "6월 12일". Date 파싱은 타임존에 따라 하루가 밀리므로
// ISO 문자열을 그대로 잘라 쓴다.
function kickoffLabel(iso: string): string {
  return `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
}

function TeamRow({ code, score }: { code: string; score: number }) {
  const t = teamDisplay(code);
  return (
    <div className="flex items-center gap-2.5">
      <FlagBadge code={code} color1={t.color1} color2={t.color2} size={26} />
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{t.nameKo}</span>
      <span className="stat-num shrink-0 text-xl text-ink">{score}</span>
    </div>
  );
}

export function MatchDetail({ match, side, onSelectSide, onReset, aside = false }: MatchDetailProps) {
  // 접근성 라벨은 컴포넌트가 직접 들고 있는다 — 데스크톱 컬럼/모바일 인라인 어느
  // 자리에 놓이든 region "선택한 경기" 하나로 잡힌다(숨겨진 쪽은 트리에서 빠진다).
  if (!match) {
    return (
      <section
        aria-label="선택한 경기"
        className="panel flex flex-col items-center gap-3 rounded-panel px-6 py-10 text-center"
      >
        <CursorClick weight="bold" className="size-6 text-accent" aria-hidden />
        <p className="text-sm font-bold text-ink">경기를 고르세요</p>
        <p className="max-w-[22ch] text-[13px] leading-relaxed text-dim">
          {aside ? "왼쪽 목록에서" : "위 목록에서"} 다시 쓸 경기를 고르면 여기에 상세가 열립니다.
        </p>
      </section>
    );
  }

  const home = teamDisplay(match.home);
  const away = teamDisplay(match.away);
  const isKor = match.home === "KOR" || match.away === "KOR";

  return (
    <section aria-label="선택한 경기" className="flex flex-col gap-4">
      <div className="panel rounded-panel">
        {/* 헤더: 라운드 · 일정/장소 · 다른 경기 고르기 */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`shrink-0 text-[13px] font-bold uppercase tracking-wider ${ROUND_LABEL_CLASS[roundTone(match.round)]}`}
            >
              {roundLabelKo(match.round)}
              {match.round === "group" && match.group ? ` ${match.group}조` : ""}
            </span>
            {isKor && (
              <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[13px] font-black text-accent">
                KOR
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 text-[13px] text-dim underline transition-colors hover:text-ink"
          >
            선택 해제
          </button>
        </div>

        {/* 스코어카드 */}
        <div className="flex flex-col gap-2.5 px-4 py-3.5">
          <TeamRow code={match.home} score={match.scoreHome} />
          <TeamRow code={match.away} score={match.scoreAway} />
        </div>

        <p className="border-t border-line px-4 py-2 text-[13px] text-dim">
          <span className="tnum">{kickoffLabel(match.kickoffISO)}</span> · {match.venueKo} · 이벤트{" "}
          <span className="tnum">{match.events.length}</span>건
        </p>
      </div>

      {/* 사이드 선택 — 스코어카드와 섞이지 않게 자체 패널로 분리한다. */}
      <div className="panel flex flex-col gap-2 rounded-panel p-4">
        <p className="data-label">지휘할 팀</p>
        {[match.home, match.away].map((code) => {
          const t = code === match.home ? home : away;
          const active = side === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onSelectSide(code)}
              aria-pressed={active}
              className={`flex min-h-[44px] items-center gap-2.5 rounded-control px-3 text-left text-sm font-bold transition-colors ${
                active ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink hover:bg-raised"
              }`}
            >
              <FlagBadge code={code} color1={t.color1} color2={t.color2} size={22} />
              <span className="min-w-0 flex-1 truncate">{t.nameKo} 지휘하기</span>
            </button>
          );
        })}
      </div>

      {/* 결정적 순간 — 팀을 고른 뒤에만. 위 두 블록과 섞이지 않게 자체 패널로 분리한다. */}
      {side && (
        <section
          aria-label="결정적 순간 선택"
          className="panel flex flex-col gap-3 rounded-panel p-4"
        >
          <h3 className="display text-lg text-ink">어디서부터 다시 쓸까</h3>
          <MomentCards match={match} side={side} />
        </section>
      )}
    </section>
  );
}
