// 세트피스(코너킥) 해결.
//
// 왜 필요한가: 지금까지 corner 이벤트는 중계 문구만 남기고 아무것도 만들지 않는
// 막다른 길이었다(match.ts의 processChance). 그 결과
//   - setPiece 능력치는 48개국 전원에게 생성되지만 어떤 역할 가중치도, 어떤 규칙도
//     읽지 않는 완전한 사장 데이터였다(roles.ts 내 setPiece 참조 0건).
//   - special.ckTakerId(코너 키커 지정)와 special.ckBigMenForward(장신 전진) 역시
//     작전실 UI에만 있고 엔진이 보지 않는 장식이었다.
//   - 실제 월드컵 득점의 약 1/4이 세트피스인데 이 엔진에서는 정확히 0%였다.
//
// 이 모듈이 그 네 가지를 한 번에 살린다: 코너가 실제로 골로 이어지고, 그 확률이
// 키커의 setPiece · 공격 측 aerial · 수비 측 aerial + GK로 결정된다.
//
// ckBigMenForward의 대가는 여기에 두지 않는다. 장신 전진의 리스크(역습 노출)는
// modifiers.ts의 ck_big_men_risk 규칙이 수비 보정으로 부담한다 — 이득은 이벤트
// 해결에, 비용은 λ 층에 두어 두 층의 책임을 섞지 않는다.

import { playersOf } from "@/lib/data/players";
import { ENGINE_CONSTANTS } from "./constants";
import { FORMATIONS } from "@/lib/data/formations";
import type { Player, Position, SideSetup } from "@/lib/types";

/** 코너 상황에서 문전으로 올라가는 포지션(기본). */
const BOX_POSITIONS: Position[] = ["CB", "ST", "AM", "WG"];
/** 장신 전진(ckBigMenForward) 시 추가로 올라가는 포지션. */
const EXTRA_BOX_POSITIONS: Position[] = ["DM", "CM"];
/** 수비 측에서 코너를 막는 포지션. */
const DEFEND_POSITIONS: Position[] = ["CB", "FB", "DM"];

// 코너 전환율 파라미터.
//
// 기준값(ENGINE_CONSTANTS.CORNER_GOAL_BASE)은 실제 코너 득점률(약 3%)보다 높다.
// 의도된 차이다 — 이 엔진의 corner 이벤트는 "아무 코너"가 아니라 이미 슈팅까지 간
// 위협적 전개가 골·선방으로 끝나지 않았을 때만 생성되는 필터된 부분집합이라, 실제
// 코너 전체의 평균보다 위험한 상황만 모여 있다.
//
// 기준값을 ENGINE_CONSTANTS에 둔 이유: 이 값은 경기당 평균 득점에 직접 영향을 주므로
// LAMBDA_BASE·REALIZED_GOAL_CALIBRATION과 함께 재적합되어야 하는 튜닝 지점이다.
// constants.ts가 그런 값을 한곳에 모으는 파일이다.
/** 키커 setPiece가 기준(50)에서 벗어난 만큼의 영향. */
const DELIVERY_DIVISOR = 500;
/** 공중전 우열(공격 aerial − 수비 aerial)의 영향. */
const AERIAL_DIVISOR = 220;
const CORNER_MIN = 0.03;
const CORNER_MAX = 0.28;

function onPitchByPosition(setup: SideSetup, positions: Position[]): Player[] {
  const formation = FORMATIONS[setup.instructions.formation];
  if (!formation) return [];
  const squad = playersOf(setup.teamId);
  const out: Player[] = [];
  for (const slot of formation.slots) {
    if (!positions.includes(slot.position)) continue;
    const player = squad.find((p) => p.id === setup.lineup[slot.id]);
    if (player) out.push(player);
  }
  return out;
}

function avg(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 코너에서 문전으로 올라가는 선수들. 장신 전진이면 중원까지 포함한다. */
export function cornerBoxPlayers(setup: SideSetup): Player[] {
  const positions = setup.special?.ckBigMenForward
    ? [...BOX_POSITIONS, ...EXTRA_BOX_POSITIONS]
    : BOX_POSITIONS;
  return onPitchByPosition(setup, positions);
}

/**
 * 코너 키커. 작전실에서 지정한 ckTakerId가 그라운드에 있으면 그 선수,
 * 없으면 온피치 선수 중 setPiece가 가장 좋은 선수가 자동으로 찬다.
 */
export function cornerTaker(setup: SideSetup): Player | undefined {
  const squad = playersOf(setup.teamId);
  const onPitchIds = new Set(Object.values(setup.lineup));
  const designated = setup.special?.ckTakerId;
  if (designated && onPitchIds.has(designated)) {
    const p = squad.find((x) => x.id === designated);
    if (p) return p;
  }
  return squad
    .filter((p) => onPitchIds.has(p.id))
    .sort((a, b) => b.setPiece - a.setPiece)[0];
}

/**
 * 이 코너가 골이 될 확률.
 *
 * 키커의 배급 능력(setPiece) + 문전 공중전 우위(공격 aerial vs 수비 aerial·GK)로
 * 결정된다. 수비 측 GK의 aerial도 포함해, 제공권이 좋은 골키퍼가 실제로 코너를
 * 지워내도록 한다.
 */
export function cornerGoalProb(attacking: SideSetup, defending: SideSetup): number {
  const taker = cornerTaker(attacking);
  const delivery = taker?.setPiece ?? 50;

  const box = cornerBoxPlayers(attacking);
  const attAerial = avg(
    box.map((p) => p.aerial),
    50
  );

  const defenders = onPitchByPosition(defending, DEFEND_POSITIONS);
  const keepers = onPitchByPosition(defending, ["GK"]);
  // GK는 한 명이지만 코너 방어에서 비중이 크므로 수비진 평균과 동등하게 섞는다.
  const defAerial =
    keepers.length > 0
      ? (avg(
          defenders.map((p) => p.aerial),
          50
        ) +
          keepers[0].aerial) /
        2
      : avg(
          defenders.map((p) => p.aerial),
          50
        );

  const raw =
    ENGINE_CONSTANTS.CORNER_GOAL_BASE +
    (delivery - 50) / DELIVERY_DIVISOR +
    (attAerial - defAerial) / AERIAL_DIVISOR;

  return Math.min(CORNER_MAX, Math.max(CORNER_MIN, raw));
}

/**
 * 코너 득점자. 문전에 올라간 선수 중 aerial에 비례한 가중 추첨.
 *
 * rand는 0~1 난수. 호출자(match.ts)가 자신의 시드 RNG에서 뽑아 넘긴다 — 이 모듈은
 * RNG를 직접 만들지 않아 순수 함수로 남는다.
 */
export function selectCornerScorer(attacking: SideSetup, rand: number): Player | undefined {
  const box = cornerBoxPlayers(attacking);
  if (box.length === 0) return undefined;
  // aerial을 그대로 가중치로 쓰면 40과 80의 차이가 2배뿐이라 장신 타깃이 잘 드러나지
  // 않는다. 기준선(45)을 빼 "제공권 우위분"만 가중치로 삼되 최소 1은 보장한다.
  const weights = box.map((p) => Math.max(1, p.aerial - 45));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const target = rand * total;
  for (let i = 0; i < box.length; i++) {
    acc += weights[i];
    if (target < acc) return box[i];
  }
  return box[box.length - 1];
}
