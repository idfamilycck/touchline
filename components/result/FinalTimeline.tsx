"use client";

// 풀타임 승률 타임라인: 경기 화면의 ProbTimeline을 그대로 재사용(골 SoccerBall · 개입
// Brain 마커)하고, 그 아래에 마커 범례와 "주요 장면"(골/개입) 라벨 목록을 붙여 복기
// 맥락을 보강한다.

import { SoccerBall, Brain, ClipboardText, type Icon } from "@phosphor-icons/react";
import { ProbTimeline } from "@/components/match/ProbTimeline";
import { teamById } from "@/lib/data/teams";
import { shootoutWinProb } from "@/lib/engine/shootout";
import type { MatchState } from "@/lib/engine/match";
import { interventionTypeKo } from "./cf-labels";

// 상대 대응 id -> 주요 장면 목록에 쓸 짧은 라벨. 중계 문구(opponent-ai.ts의 textKo)는
// 한 문장짜리 서술이라 타임라인 칩에는 길다.
const OPP_MOVE_LABEL: Record<string, string> = {
  opp_all_out: "상대 총공세",
  opp_chase: "상대 공세 강화",
  opp_late_gamble: "상대 막판 승부수",
  opp_manage_lead: "상대 경기 관리",
  opp_park_bus: "상대 잠그기",
};

interface FinalTimelineProps {
  match: MatchState;
  /** 다시 쓰기 모드에서 지휘봉을 잡은 분(복기 타임라인에 인계 마커로 표시). */
  takeoverMinute?: number;
}

export function FinalTimeline({ match, takeoverMinute }: FinalTimelineProps) {
  const me = teamById(match.me.teamId);
  const opp = teamById(match.opp.teamId);

  const goals = match.events
    .filter((e) => e.type === "goal")
    .map((e) => ({
      minute: e.minute,
      label: `${e.side === "me" ? me?.code ?? "우리" : opp?.code ?? "상대"} 골`,
      Icon: SoccerBall as Icon,
      mine: e.side === "me",
    }));

  const subs = match.interventions.map((iv) => ({
    minute: iv.minute,
    label: interventionTypeKo(iv),
    Icon: Brain as Icon,
    mine: true,
  }));

  // 상대 감독의 대응도 주요 장면에 넣는다. 우리 개입만 표시하면 "왜 70분 이후로
  // 갑자기 승률이 떨어졌는가"의 절반(상대가 손을 썼다)이 리포트에서 사라진다.
  const oppMoves = (match.oppReactions ?? []).map((r) => ({
    minute: r.minute,
    label: OPP_MOVE_LABEL[r.id] ?? "상대 전술 변경",
    Icon: ClipboardText as Icon,
    mine: false,
  }));

  const moments = [...goals, ...subs, ...oppMoves].sort((a, b) => a.minute - b.minute);

  return (
    <section className="flex flex-col gap-3">
      <ProbTimeline
        timeline={match.probTimeline}
        events={match.events}
        interventions={match.interventions}
        shootoutWinProb={shootoutWinProb(match.me, match.opp)}
        takeoverMinute={takeoverMinute}
      />

      {/* 범례 */}
      <div className="flex items-center gap-4 px-1 text-[13px] text-dim">
        <span className="flex items-center gap-1">
          <SoccerBall size={13} weight="bold" aria-hidden /> 골
        </span>
        <span className="flex items-center gap-1">
          <Brain size={13} weight="bold" aria-hidden /> 나의 개입
        </span>
        <span className="flex items-center gap-1">
          <ClipboardText size={13} weight="bold" aria-hidden /> 상대 대응
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-gain)" }} aria-hidden />
          유리
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-danger)" }} aria-hidden />
          불리
        </span>
      </div>

      {/* 주요 장면 */}
      {moments.length > 0 && (
        <ul className="flex flex-col">
          {moments.map((m, i) => (
            <li
              key={`${m.minute}-${i}`}
              className="data-row flex items-center gap-2.5 px-2 py-2"
            >
              <span className="stat-num w-9 shrink-0 text-right text-[13px] text-dim">{m.minute}′</span>
              <m.Icon size={14} weight="bold" aria-hidden />
              <span className={`text-[13px] ${m.mine ? "text-ink" : "text-dim"}`}>{m.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
