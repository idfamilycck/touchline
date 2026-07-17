"use client";

// 방송 스코어보드(스코어버그): 양 팀 배지·코드 + 대형 스코어 + 경기 시각 + 경기장.
// 시각은 전·후반 추가시간을 45+ / 90+ 로 표기한다(엔진은 전반 추가시간을 만들지 않으므로
// 실질적으로 90+만 등장하지만, 표기 규칙은 양쪽 모두 지원해 둔다).

import { FlagBadge } from "@/components/ui/FlagBadge";
import { teamById } from "@/lib/data/teams";
import { venueById } from "@/lib/data/venues";

export function minuteLabel(minute: number): string {
  if (minute > 90) return `90+${minute - 90}'`;
  if (minute > 45 && minute < 46) return `45+${Math.round((minute - 45) * 10)}'`;
  return `${minute}'`;
}

interface ScoreboardProps {
  meTeamId: string;
  oppTeamId: string;
  scoreMe: number;
  scoreOpp: number;
  minute: number;
  venueId: string;
  finished: boolean;
}

export function Scoreboard({
  meTeamId,
  oppTeamId,
  scoreMe,
  scoreOpp,
  minute,
  venueId,
  finished,
}: ScoreboardProps) {
  const me = teamById(meTeamId);
  const opp = teamById(oppTeamId);
  const venue = venueById(venueId);

  return (
    <div className="panel rounded-3xl px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-center justify-center gap-4 sm:gap-8">
        {/* 우리 팀 */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-bold text-ink sm:text-base">{me?.nameKo ?? "우리"}</p>
            <p className="eyebrow text-accent">{me?.code ?? "ME"}</p>
          </div>
          {me && <FlagBadge code={me.code} color1={me.color1} color2={me.color2} size={40} />}
        </div>

        {/* 스코어 + 시각 */}
        <div className="flex shrink-0 flex-col items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="stat-num display text-4xl text-ink sm:text-5xl">{scoreMe}</span>
            <span className="stat-num text-2xl text-dim sm:text-3xl">:</span>
            <span className="stat-num display text-4xl text-ink sm:text-5xl">{scoreOpp}</span>
          </div>
          <span
            className={`stat-num mt-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
              finished ? "bg-surface-2 text-dim" : "bg-accent text-accent-ink"
            }`}
            aria-live="off"
          >
            {finished ? "경기 종료" : minuteLabel(minute)}
          </span>
        </div>

        {/* 상대 팀 */}
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {opp && <FlagBadge code={opp.code} color1={opp.color1} color2={opp.color2} size={40} />}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink sm:text-base">{opp?.nameKo ?? "상대"}</p>
            <p className="eyebrow text-danger">{opp?.code ?? "OPP"}</p>
          </div>
        </div>
      </div>

      {venue && (
        <p className="mt-2 text-center text-[11px] text-dim">
          🏟 {venue.nameKo} · {venue.cityKo}
        </p>
      )}
    </div>
  );
}
