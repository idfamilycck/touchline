"use client";

// 실시간 중계 피드: 최신 이벤트가 위로 쌓인다. 타입별 아이콘 + 골/위기 강조.
// aria-live="polite"로 스크린리더가 새 중계를 읽어준다. 성능을 위해 최근 ~40개만 렌더한다.

import { minuteLabel } from "./Scoreboard";
import type { MatchEvent, MatchEventType } from "@/lib/engine/match";

const ICON: Record<MatchEventType, string> = {
  kickoff: "🏟",
  chance: "💬",
  shot: "🥅",
  goal: "⚽",
  save: "🧤",
  corner: "🚩",
  card: "🟨",
  crisis: "🚨",
  sub: "🔄",
  tactic_change: "📋",
  halftime: "⏱",
  fulltime: "🏁",
};

const MAX_ROWS = 40;

interface CommentaryFeedProps {
  events: MatchEvent[];
  meTeamId: string;
}

export function CommentaryFeed({ events, meTeamId }: CommentaryFeedProps) {
  // 최근 MAX_ROWS개만, 최신이 위로 오도록 역순.
  const rows = events.slice(-MAX_ROWS).reverse();

  return (
    <div className="panel flex h-full flex-col rounded-[10px]">
      <div className="panel-head">
        <p className="eyebrow text-accent">실시간 중계</p>
        <span className="text-[11px] text-dim">최신순</span>
      </div>
      <ul
        aria-live="polite"
        aria-label="경기 실시간 중계"
        className="flex flex-1 flex-col overflow-y-auto px-3 py-1"
        style={{ maxHeight: "clamp(240px, 42vh, 460px)" }}
      >
        {rows.map((e, i) => {
          const isGoal = e.type === "goal";
          const isCrisis = e.type === "crisis";
          const isOurs = e.side === "me";
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
                className="stat-num mt-0.5 w-9 shrink-0 text-right text-[11px] text-dim"
                aria-hidden
              >
                {minuteLabel(e.minute)}
              </span>
              <span className="shrink-0 text-base leading-tight" aria-hidden>
                {ICON[e.type]}
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
