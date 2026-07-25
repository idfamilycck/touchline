"use client";

// 선수 평점.
//
// 결과 화면에 "누가 잘했나"가 없었다. 그런데 필요한 데이터는 처음부터 다 있었다 —
// chance/shot/goal/save/card/red 이벤트에 playerId가 붙어 있다. 새로 시뮬레이션할
// 것 없이 집계만 하면 되는, 투입 대비 산출이 가장 좋은 항목이었다.
//
// 이벤트에 한 번도 등장하지 않은 선수는 표시하지 않는다 — "기록이 없다"와 "평점 6.0"은
// 다른 정보이고, 없는 데이터를 지어내지 않는다는 이 프로젝트의 원칙을 따른다.

import { Star } from "@phosphor-icons/react";
import { playerRatings } from "@/lib/engine/match-stats";
import { playersOf } from "@/lib/data/players";
import { teamById } from "@/lib/data/teams";
import type { MatchState } from "@/lib/engine/match";

interface PlayerRatingsProps {
  match: MatchState;
}

/** 평점 색: 7.5 이상 좋음, 5.5 미만 나쁨, 그 사이는 중립. */
function ratingColor(rating: number): string {
  if (rating >= 7.5) return "var(--color-gain)";
  if (rating < 5.5) return "var(--color-danger)";
  return "var(--color-ink)";
}

export function PlayerRatings({ match }: PlayerRatingsProps) {
  const rows = playerRatings(match.events);
  const mine = rows.filter((r) => r.side === "me");
  if (mine.length === 0) return null;

  const squad = playersOf(match.me.teamId);
  const meTeam = teamById(match.me.teamId);
  const nameOf = (id: string) => squad.find((p) => p.id === id)?.name ?? id;
  const best = mine[0];

  return (
    <section className="panel flex flex-col rounded-panel">
      <div className="panel-head">
        <p className="eyebrow text-accent">선수 평점</p>
        <span className="text-[13px] text-dim">{meTeam?.nameKo ?? "우리 팀"}</span>
      </div>

      {/* 최우수 선수 */}
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Star size={18} weight="fill" color="var(--color-accent)" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-dim">이 경기 최우수</p>
          <p className="truncate text-sm font-bold text-ink">{nameOf(best.playerId)}</p>
        </div>
        <span className="stat-num text-2xl" style={{ color: ratingColor(best.rating) }}>
          {best.rating.toFixed(1)}
        </span>
      </div>

      <ul className="flex flex-col px-2 py-1">
        {mine.map((r) => (
          <li key={r.playerId} className="data-row flex items-center gap-2.5 px-2 py-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
              {nameOf(r.playerId)}
            </span>
            {/* 기여 요약. 0인 항목은 적지 않는다(빈 값으로 줄을 늘리지 않는다). */}
            <span className="shrink-0 text-[11px] text-dim">
              {[
                r.goals > 0 ? `골 ${r.goals}` : null,
                r.shots > 0 ? `슈팅 ${r.shots}` : null,
                r.cards > 0 ? `경고 ${r.cards}` : null,
                r.sentOff ? "퇴장" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span
              className="stat-num w-9 shrink-0 text-right text-sm font-bold"
              style={{ color: ratingColor(r.rating) }}
            >
              {r.rating.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>

      <p className="px-4 pb-3 pt-1 text-[11px] leading-relaxed text-dim">
        기본 6.0에서 골·찬스·슈팅은 가점, 경고·퇴장은 감점으로 계산합니다. 경기 중 기록이
        남은 선수만 표시합니다.
      </p>
    </section>
  );
}
