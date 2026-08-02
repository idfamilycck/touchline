"use client";

// 실시간 중계 피드: 최신 이벤트가 위로 쌓인다. 타입별 아이콘 + 골/위기 강조.
// aria-live="polite"로 스크린리더가 새 중계를 읽어준다. 성능을 위해 최근 ~40개만 렌더한다.

import {
  Buildings,
  ChatCircle,
  Target,
  SoccerBall,
  HandPalm,
  Flag,
  Square,
  Siren,
  Prohibit,
  ArrowsClockwise,
  ClipboardText,
  Timer,
  FlagCheckered,
  type Icon,
} from "@phosphor-icons/react";
import { minuteLabel } from "./Scoreboard";
import type { MatchEvent, MatchEventType } from "@/lib/engine/match";

// 이벤트 타입 -> 실시간 중계 아이콘(순수 UI 장식, e.textKo 본문과는 별개).
const ICON: Record<MatchEventType, Icon> = {
  kickoff: Buildings,
  chance: ChatCircle,
  shot: Target,
  goal: SoccerBall,
  save: HandPalm,
  corner: Flag,
  card: Square,
  red: Prohibit,
  opp_tactic: ClipboardText,
  crisis: Siren,
  sub: ArrowsClockwise,
  tactic_change: ClipboardText,
  halftime: Timer,
  period: Timer,
  fulltime: FlagCheckered,
};

const MAX_ROWS = 40;

interface CommentaryFeedProps {
  events: MatchEvent[];
  /** 연장 진입 이후면 분 표기가 "90+n"이 아니라 실제 시각(91~120)이다. */
  extraTime?: boolean;
}

export function CommentaryFeed({ events, extraTime = false }: CommentaryFeedProps) {
  // 최근 MAX_ROWS개만, 최신이 위로 오도록 역순.
  const rows = events.slice(-MAX_ROWS).reverse();

  return (
    <div className="panel flex w-full flex-col rounded-panel lg:h-full lg:min-h-0">
      <div className="panel-head lg:shrink-0">
        <p className="eyebrow text-accent">실시간 중계</p>
        <span className="text-[13px] text-dim">최신순</span>
      </div>
      {/* 모바일은 42vh 캡 + 자체 스크롤(중계가 화면을 잡아먹지 않게). lg에서는 패널이
          경기 지표 하단까지 세로로 꽉 차고, 넘치는 중계는 이 목록 안에서만 스크롤한다
          (패널 높이는 고정, 하단 정렬 유지). */}
      <ul
        aria-live="polite"
        aria-label="경기 실시간 중계"
        className="flex flex-col px-3 py-1 max-h-[clamp(240px,42vh,460px)] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
      >
        {rows.map((e, i) => {
          const isGoal = e.type === "goal";
          // 퇴장은 위기와 동급으로 강조한다 — 수적 열세는 남은 시간 전체의 승률을
          // 바꾸는 사건이라 중계에서 흘려보내면 안 된다.
          const isCrisis = e.type === "crisis" || e.type === "red";
          const isOurs = e.side === "me";
          const EventIcon = ICON[e.type];
          return (
            <li
              key={`${e.minute}-${events.length - i}-${e.type}`}
              className={`data-row flex items-start gap-2.5 px-2 py-2 ${
                isGoal
                  ? "border-l-2 border-accent bg-accent/10"
                  : isCrisis
                    ? "border-l-2 border-danger bg-danger/10"
                    : ""
              }`}
            >
              <span
                className="stat-num mt-0.5 w-9 shrink-0 text-right text-[13px] text-dim"
                aria-hidden
              >
                {minuteLabel(e.minute, extraTime)}
              </span>
              <span className="mt-0.5 shrink-0 leading-none" aria-hidden>
                <EventIcon size={15} weight="bold" />
              </span>
              <span
                className={`text-[13px] leading-snug ${
                  isGoal
                    ? "font-bold text-accent"
                    : isCrisis
                      ? "font-bold text-danger"
                      : isOurs
                        ? "text-ink"
                        : "text-dim"
                }`}
              >
                {e.textKo}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
