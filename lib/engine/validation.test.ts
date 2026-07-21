// 엔진 검증 회귀 테스트.
//
// 엔진의 킥오프 승률 모델(분석적 poisson)을 실제 2026 월드컵 103경기에 무개입(실제
// 선발 라인업)으로 적용해 실제 결과 재현율을 잰다. 결정론적이므로 lib/wc2026/validation.ts에
// 박아둔 표시용 수치와 실측이 일치하는지 검증한다. 엔진을 바꿔 수치가 움직이면 이 테스트가
// 실패해, 화면·기획서에 노출되는 숫자를 갱신하도록 강제한다.
//
// 골 MAE는 분당 시뮬레이션(찬스->슛->골 체인)이 실현하는 평균 스코어로 재므로 시드가
// 필요하다. 승/무/패는 분석적 λ로 바로 계산되어 시드가 필요 없다.

import { describe, it, expect } from "vitest";
import { registerWc2026 } from "@/lib/wc2026/register";
import { wc2026Matches } from "@/lib/wc2026/data";
import { fromRealState } from "@/lib/engine/rewrite";
import { computeLambdas } from "@/lib/engine/winprob";
import { outcomeProbs } from "@/lib/engine/poisson";
import { simulateMinute, type MatchState } from "@/lib/engine/match";
import { ENGINE_VALIDATION } from "@/lib/wc2026/validation";
import type { Wc2026Match } from "@/lib/wc2026/types";

type Outcome = "W" | "D" | "L"; // 홈 기준

function realRegulation(match: Wc2026Match): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const e of match.events) {
    if (e.minute > 90) continue;
    if (e.type === "goal" || e.type === "pen_goal") {
      if (e.teamCode === match.home) home += 1;
      else if (e.teamCode === match.away) away += 1;
    } else if (e.type === "own_goal") {
      // own_goal.teamCode = 자기 골문에 넣은 팀 -> 득점은 상대에 가산.
      if (e.teamCode === match.home) away += 1;
      else if (e.teamCode === match.away) home += 1;
    }
  }
  return { home, away };
}

function outcome(h: number, a: number): Outcome {
  if (h > a) return "W";
  if (h < a) return "L";
  return "D";
}

// 분석적 예측: 킥오프 λ로 poisson 승/무/패를 구하고 승/패 중 큰 쪽을 예측한다.
function predictOutcome(match: Wc2026Match): Outcome {
  const s0 = fromRealState(match, match.home, { takeoverMinute: 0 }, 1);
  const { lambdaMe, lambdaOpp } = computeLambdas(s0.me, s0.opp, s0.venueId);
  const p = outcomeProbs(lambdaMe, lambdaOpp);
  return p.win >= p.loss ? "W" : "L";
}

function simulateNoIntervention(match: Wc2026Match, seed: number): { home: number; away: number } {
  let s: MatchState = fromRealState(match, match.home, { takeoverMinute: 0 }, seed);
  let guard = 0;
  while (!s.finished && guard < 200) {
    s = simulateMinute(s);
    guard += 1;
  }
  return { home: s.scoreMe, away: s.scoreOpp };
}

describe("엔진 검증: 실제 경기 재현율", () => {
  registerWc2026();
  const matches = wc2026Matches();
  const GOAL_SEEDS = 15;

  let winnerHit = 0;
  let total = 0;
  let decidedHit = 0;
  let decidedTotal = 0;
  let goalAbsErr = 0;
  let goalCount = 0;

  for (const match of matches) {
    const real = realRegulation(match);
    const realOut = outcome(real.home, real.away);
    const predicted = predictOutcome(match);

    total += 1;
    if (predicted === realOut) winnerHit += 1;
    if (realOut !== "D") {
      decidedTotal += 1;
      if (predicted === realOut) decidedHit += 1;
    }

    let sumHome = 0;
    let sumAway = 0;
    for (let k = 0; k < GOAL_SEEDS; k++) {
      const sim = simulateNoIntervention(match, 1000 + k * 7 + match.id.length);
      sumHome += sim.home;
      sumAway += sim.away;
    }
    goalAbsErr += Math.abs(sumHome / GOAL_SEEDS - real.home) + Math.abs(sumAway / GOAL_SEEDS - real.away);
    goalCount += 2;
  }

  const outcomeRatePct = (winnerHit / total) * 100;
  const decisiveWinRatePct = (decidedHit / decidedTotal) * 100;
  const goalMae = goalAbsErr / goalCount;

  it("검증 경기 수가 데이터 전량과 일치한다", () => {
    expect(total).toBe(ENGINE_VALIDATION.matches);
  });

  it("승/무/패 재현율이 표시 수치와 일치한다", () => {
    expect(outcomeRatePct).toBeCloseTo(ENGINE_VALIDATION.outcomeRatePct, 1);
  });

  it("승부가 갈린 경기의 승자 재현율이 표시 수치와 일치한다", () => {
    expect(decisiveWinRatePct).toBeCloseTo(ENGINE_VALIDATION.decisiveWinRatePct, 1);
  });

  it("득점 오차(MAE)가 표시 수치와 일치한다", () => {
    expect(goalMae).toBeCloseTo(ENGINE_VALIDATION.goalMae, 2);
  });

  it("승자 재현율은 무작위 기준선(33%)을 확실히 넘는다", () => {
    expect(outcomeRatePct).toBeGreaterThan(50);
  });
});
