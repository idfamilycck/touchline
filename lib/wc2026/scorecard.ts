// 엔진 성적표(표시용) — "이 엔진이 실제를 이만큼 맞힌다"를 경기별로 보여주기 위한
// 데이터. lib/engine/validation.test.ts와 "똑같은" 분석 예측(킥오프 λ → poisson 승/무/패,
// 승/패 중 큰 쪽)을 쓴다. 그래서 여기서 나오는 집계(승부 갈린 경기 승자 재현율)는
// lib/wc2026/validation.ts의 표시 수치와 일치해야 하며, scorecard.test.ts가 이를 강제한다.
//
// 무개입·분석적 계산이라 시뮬레이션(느림)이 필요 없다 — 104경기 예측이 가볍고
// 결정론적이라 클라이언트에서 한 번 계산해 메모이즈해도 된다.

import { registerWc2026 } from "@/lib/wc2026/register";
import { wc2026Matches } from "@/lib/wc2026/data";
import { fromRealState } from "@/lib/engine/rewrite";
import { computeLambdas } from "@/lib/engine/winprob";
import { outcomeProbs } from "@/lib/engine/poisson";
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

// 분석적 예측: 킥오프 λ로 poisson 승/패를 구하고 큰 쪽을 예측(무승부는 예측하지 않음).
function predictOutcome(match: Wc2026Match): Outcome {
  const s0 = fromRealState(match, match.home, { takeoverMinute: 0 }, 1);
  const { lambdaMe, lambdaOpp } = computeLambdas(s0.me, s0.opp, s0.venueId);
  const p = outcomeProbs(lambdaMe, lambdaOpp);
  return p.win >= p.loss ? "W" : "L";
}

export interface ScorecardCell {
  id: string;
  homeCode: string;
  awayCode: string;
  home: number;
  away: number;
  /** 승자를 맞혔는가(승부가 갈린 경기만 셀로 만든다). */
  correct: boolean;
  round: string;
}

export interface Scorecard {
  matches: number; // 검증 전체 경기 수
  decisive: number; // 승부가 갈린 경기 수(무승부 제외)
  correct: number; // 그중 승자를 맞힌 수
  draws: number; // 무승부 수
  ratePct: number; // 승부 갈린 경기 승자 재현율(%)
  cells: ScorecardCell[]; // 승부 갈린 경기 셀(입력 순서 = 대회 진행 순서)
}

export function engineScorecard(): Scorecard {
  registerWc2026();
  const matches = wc2026Matches();

  const cells: ScorecardCell[] = [];
  let decisive = 0;
  let correct = 0;
  let draws = 0;

  for (const m of matches) {
    const real = realRegulation(m);
    const realOut = outcome(real.home, real.away);
    if (realOut === "D") {
      draws += 1;
      continue;
    }
    const hit = predictOutcome(m) === realOut;
    decisive += 1;
    if (hit) correct += 1;
    cells.push({
      id: m.id,
      homeCode: m.home,
      awayCode: m.away,
      home: real.home,
      away: real.away,
      correct: hit,
      round: m.round,
    });
  }

  return {
    matches: matches.length,
    decisive,
    correct,
    draws,
    ratePct: decisive > 0 ? (correct / decisive) * 100 : 0,
    cells,
  };
}
