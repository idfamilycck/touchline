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

// ── 최근 흐름(모멘텀) ────────────────────────────────────────────────────────
// 누적 스탯(점유율·슈팅)은 "경기 전체가 어땠나"를 말하지 "지금 누가 밀어붙이고
// 있나"를 말하지 못한다. 60분에 0-0인데 우리가 최근 10분 내내 두들기고 있는지
// 반대로 몰리고 있는지는 감독이 개입을 결정하는 데 가장 중요한 신호인데, 지금까지
// 화면 어디에도 없었다.
//
// 측정 방식: 최근 MOMENTUM_WINDOW_MIN분의 공격 이벤트에 위협도 가중치를 매겨
// 양 팀을 비교한다. 추정이 아니라 시뮬레이션이 실제로 낸 이벤트만 센다.

/** 모멘텀을 재는 최근 구간(분). */
export const MOMENTUM_WINDOW_MIN = 10;

/** 이벤트별 위협 가중치. 골에 가까울수록 크다. */
const THREAT_WEIGHT: Partial<Record<MatchEvent["type"], number>> = {
  goal: 5,
  save: 3,
  shot: 2,
  corner: 1.5,
  chance: 1,
};

export interface Momentum {
  /** 0~100. 50이면 대등, 100에 가까울수록 우리가 몰아치는 중. */
  meShare: number;
  /** 구간 내 양 팀 위협 총량(0이면 조용한 구간). */
  totalWeight: number;
  /** 측정 구간의 시작 분. */
  fromMinute: number;
}

export function recentMomentum(
  events: MatchEvent[],
  minute: number,
  windowMin: number = MOMENTUM_WINDOW_MIN
): Momentum {
  const fromMinute = Math.max(0, minute - windowMin);
  let me = 0;
  let opp = 0;
  for (const e of events) {
    if (e.minute <= fromMinute || e.minute > minute) continue;
    const w = THREAT_WEIGHT[e.type];
    if (!w) continue;
    if (e.side === "me") me += w;
    else if (e.side === "opp") opp += w;
  }
  const total = me + opp;
  return {
    // 조용한 구간에서 0/0을 100%로 튀게 두면 안 된다 — 대등(50)으로 본다.
    meShare: total > 0 ? Math.round((me / total) * 100) : 50,
    totalWeight: total,
    fromMinute,
  };
}

// ── 팀 평균 체력 ─────────────────────────────────────────────────────────────
// stamina는 선수별(0~1)로만 있어서 "우리 팀이 지금 얼마나 지쳐 있나"를 한눈에 볼
// 방법이 없었다. 교체 타이밍 판단에 필요한 값이라 팀 평균으로 접어 준다.

/**
 * 온피치 선발 11명의 평균 체력(0~100).
 * lineup에 배치된 선수만 세므로 벤치는 평균을 끌어올리지 않는다.
 */
export function teamStaminaPct(
  lineup: Record<string, string | undefined>,
  stamina: Record<string, number>
): number {
  let sum = 0;
  let n = 0;
  for (const playerId of Object.values(lineup)) {
    if (!playerId) continue;
    sum += stamina[playerId] ?? 1;
    n += 1;
  }
  return n > 0 ? Math.round((sum / n) * 100) : 100;
}

// ── 선수 평점 ────────────────────────────────────────────────────────────────
//
// 결과 화면에 "누가 잘했나"가 없었다. 그런데 필요한 데이터는 이미 전부 있다 —
// chance/shot/goal/save/corner/card/red 이벤트에 playerId가 붙어 있고, 체력도
// 선수별로 남는다. 새로 시뮬레이션할 것 없이 집계만 하면 된다.
//
// 축구 중계 평점 관례에 맞춰 6.0을 기본으로 두고 기여·실책으로 가감한다.

/** 평점 기본값. 특별히 잘하지도 못하지도 않은 90분. */
const RATING_BASE = 6.0;
const RATING_MIN = 4.0;
const RATING_MAX = 10.0;

/** 이벤트별 평점 가감. */
const RATING_DELTA: Partial<Record<MatchEvent["type"], number>> = {
  goal: 1.2,
  shot: 0.15,
  chance: 0.2,
  corner: 0.05,
  // 선방 이벤트의 playerId는 "슈팅한 선수"다(막은 GK가 아니다) — 엔진의 이벤트 계약
  // 이 그렇게 되어 있다. 슈팅을 만들었으나 막힌 것이므로 작은 가점만 준다.
  save: 0.1,
  card: -0.4,
  red: -2.0,
};

export interface PlayerRating {
  playerId: string;
  side: "me" | "opp";
  rating: number;
  goals: number;
  shots: number;
  chances: number;
  cards: number;
  sentOff: boolean;
}

/**
 * 이벤트 로그에서 선수별 평점을 집계한다.
 *
 * 이벤트에 등장하지 않은 선수는 결과에 포함되지 않는다 — "기록이 없다"와 "평점 6.0"은
 * 다른 정보이므로 없는 데이터를 지어내지 않는다.
 */
export function playerRatings(events: MatchEvent[]): PlayerRating[] {
  const acc = new Map<string, PlayerRating>();

  for (const e of events) {
    if (!e.playerId) continue;
    const delta = RATING_DELTA[e.type];
    if (delta === undefined) continue;

    const key = `${e.side}:${e.playerId}`;
    const row =
      acc.get(key) ??
      {
        playerId: e.playerId,
        side: e.side,
        rating: RATING_BASE,
        goals: 0,
        shots: 0,
        chances: 0,
        cards: 0,
        sentOff: false,
      };

    row.rating += delta;
    if (e.type === "goal") row.goals += 1;
    if (e.type === "shot") row.shots += 1;
    if (e.type === "chance") row.chances += 1;
    if (e.type === "card") row.cards += 1;
    if (e.type === "red") row.sentOff = true;
    acc.set(key, row);
  }

  return [...acc.values()]
    .map((r) => ({
      ...r,
      // 소수 첫째 자리까지. 중계 평점 관례와 같다.
      rating: Math.round(Math.min(RATING_MAX, Math.max(RATING_MIN, r.rating)) * 10) / 10,
    }))
    .sort((a, b) => b.rating - a.rating);
}

/** 우리 팀 최우수 선수(MOM). 기록이 없으면 undefined. */
export function manOfTheMatch(events: MatchEvent[], side: "me" | "opp" = "me"): PlayerRating | undefined {
  return playerRatings(events).find((r) => r.side === side);
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
  // draw는 여기서 보지 않는다: 개입 효과는 "승률이 몇 %p 움직였나"라는 단일 축으로
  // 재는 게 리포트 문장으로 읽히기 때문이다(무승부 확률까지 섞으면 부호 해석이 모호해진다).
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
