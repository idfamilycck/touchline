// 경기 기록 집계(순수 함수). MatchState.events에서 방송 중계식 스탯 라인을 뽑는다.
//
// 엔진의 이벤트 사슬은 이렇게 생겼다:
//   chance -> (확률) shot -> goal | save | corner
// 따라서 각 지표는 다음과 같이 "측정"된다(추정이 아니다):
//   슈팅      = shot 이벤트 수
//   유효슈팅  = goal + save (골은 들어갔고, 선방은 골키퍼가 막았으니 둘 다 골문 안쪽)
//   코너킥    = corner (슈팅이 수비에 맞고 나간 것)
//   찬스      = chance (슈팅까지 가지 못한 것 포함)
//
// 점유율에 대하여: 이 엔진은 볼 점유를 시뮬레이션하지 않는다. 그래서 "점유율 62%"처럼
// 있지도 않은 측정치를 지어내지 않는다. 대신 실제로 시뮬레이션된 값인 "찬스 생성 비중"을
// 공격 점유로 부르고, UI에서 그 정의를 밝힌다. 축구 중계의 점유율과 다른 지표이므로
// 이름도 다르게 쓴다.

import type { MatchEvent, MatchState, Intervention } from "./match";

export interface SideStats {
  goals: number;
  shots: number;
  onTarget: number;
  corners: number;
  chances: number;
  cards: number;
  saves: number;
  /** 유효슈팅 대비 득점(결정력). 유효슈팅이 0이면 null. */
  conversion: number | null;
}

export interface MatchStats {
  me: SideStats;
  opp: SideStats;
  /** 볼 점유율(0~100, me 기준). 엔진이 매 분 누적한 실제 점유. */
  possessionMe: number;
  /** 찬스 생성 비중(0~100). 점유와 별개로 "공격 위협" 비교에 쓴다. */
  attackShareMe: number;
  totalChances: number;
}

function countSide(events: MatchEvent[], side: "me" | "opp"): SideStats {
  let goals = 0;
  let shots = 0;
  let saves = 0;
  let corners = 0;
  let chances = 0;
  let cards = 0;

  for (const e of events) {
    if (e.side !== side) continue;
    switch (e.type) {
      case "goal":
        goals += 1;
        break;
      case "shot":
        shots += 1;
        break;
      case "save":
        saves += 1;
        break;
      case "corner":
        corners += 1;
        break;
      case "chance":
        chances += 1;
        break;
      case "card":
        cards += 1;
        break;
    }
  }

  // 골과 선방은 둘 다 "골문 안쪽으로 간 슈팅"이다.
  const onTarget = goals + saves;
  return {
    goals,
    shots,
    onTarget,
    corners,
    chances,
    cards,
    saves,
    conversion: onTarget > 0 ? goals / onTarget : null,
  };
}

export function matchStats(
  state: Pick<MatchState, "events"> & Partial<Pick<MatchState, "possMeAccum" | "possMinutes">>
): MatchStats {
  const me = countSide(state.events, "me");
  const opp = countSide(state.events, "opp");
  const totalChances = me.chances + opp.chances;
  const attackShareMe =
    totalChances > 0 ? Math.round((me.chances / totalChances) * 100) : 50;

  // 점유율: 엔진이 누적한 값. 옛 상태(누적 필드 없음)는 50%로 폴백한다.
  const possessionMe =
    state.possMinutes && state.possMinutes > 0
      ? Math.round(((state.possMeAccum ?? 0) / state.possMinutes) * 100)
      : 50;

  return { me, opp, possessionMe, attackShareMe, totalChances };
}

// ── 개입 효과 ────────────────────────────────────────────────────────────────
// "감독이 개입했더니 승률이 어떻게 움직였나"는 이 앱에서 가장 감독 리포트다운 지표인데
// 지금까지 어디에서도 쓰이지 않고 있었다. interventions(개입 시각)와 probTimeline
// (분당 승률)이 이미 상태에 있으므로 추가 시뮬레이션 없이 계산된다.

export interface InterventionImpact {
  minute: number;
  /** 개입 직전 승률(%). */
  before: number;
  /** 개입 후 WINDOW분 시점의 승률(%). 경기가 먼저 끝나면 마지막 값. */
  after: number;
  /** after - before (%p). */
  deltaPct: number;
}

/** 개입 효과를 재는 관찰 구간(분). 너무 짧으면 노이즈, 너무 길면 다른 요인이 섞인다. */
export const IMPACT_WINDOW_MIN = 10;

function winPctAt(timeline: Array<{ minute: number; win: number }>, minute: number): number | null {
  if (timeline.length === 0) return null;
  let val: number | null = null;
  for (const p of timeline) {
    if (p.minute <= minute) val = p.win;
    else break;
  }
  // 요청한 분이 타임라인 시작보다 앞서면 첫 값을 쓴다.
  return Math.round((val ?? timeline[0].win) * 100);
}

export function interventionImpacts(
  interventions: Intervention[],
  timeline: Array<{ minute: number; win: number }>
): InterventionImpact[] {
  const out: InterventionImpact[] = [];
  for (const iv of interventions) {
    const before = winPctAt(timeline, iv.minute);
    const after = winPctAt(timeline, iv.minute + IMPACT_WINDOW_MIN);
    if (before === null || after === null) continue;
    out.push({ minute: iv.minute, before, after, deltaPct: after - before });
  }
  return out;
}
